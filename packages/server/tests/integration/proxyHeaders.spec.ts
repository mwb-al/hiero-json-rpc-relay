// SPDX-License-Identifier: Apache-2.0

import { ConfigService } from '@hashgraph/json-rpc-config-service/dist/services';
import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { expect } from 'chai';
import { Server } from 'http';
import Koa from 'koa';
import { pino } from 'pino';

import { ConfigServiceTestHelper } from '../../../config-service/tests/configServiceTestHelper';

ConfigServiceTestHelper.appendEnvsFromPath(__dirname + '/test.env');

import {
  overrideEnvsInMochaDescribe,
  useInMemoryRedisServer,
  withOverriddenEnvsInMochaTest,
} from '../../../relay/tests/helpers';
import RelayCalls from '../../tests/helpers/constants';

describe('Proxy Headers Integration Tests', function () {
  const logger = pino({ level: 'silent' });

  // Use in-memory Redis server for CI compatibility
  useInMemoryRedisServer(logger, 6380);

  // Test with rate limiting enabled and a low limit to make testing easier
  overrideEnvsInMochaDescribe({
    RATE_LIMIT_DISABLED: false,
    TIER_2_RATE_LIMIT: 3, // Low limit for easy testing
  });

  let testServer: Server;
  let testClient: AxiosInstance;
  let app: Koa<Koa.DefaultState, Koa.DefaultContext>;

  // Simple static test IPs - each test uses different IP ranges to avoid conflicts
  const TEST_IP_A = '192.168.1.100';
  const TEST_IP_B = '192.168.2.100';
  const TEST_IP_C = '192.168.3.100';
  const TEST_IP_D = '192.168.4.100';
  const TEST_IP_E = '192.168.5.100';
  const TEST_IP_F = '192.168.6.100';
  const TEST_IP_G = '192.168.7.100';
  const TEST_IP_H = '192.168.8.100';
  const TEST_IP_I = '192.168.9.100';
  const TEST_IP_J = '192.168.10.100';
  const TEST_IPV6 = '2001:db8::1';
  const TEST_METHOD = RelayCalls.ETH_ENDPOINTS.ETH_CHAIN_ID;

  before(function () {
    app = require('../../src/server').default;
    testServer = app.listen(ConfigService.get('E2E_SERVER_PORT'));
    testClient = createTestClient();
  });

  after(function () {
    testServer.close((err) => {
      if (err) {
        console.error(err);
      }
    });
  });

  this.timeout(10000);

  function createTestClient(port = ConfigService.get('E2E_SERVER_PORT')) {
    return Axios.create({
      baseURL: 'http://localhost:' + port,
      responseType: 'json' as const,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      timeout: 5 * 1000,
    });
  }

  function createRequestWithIP(id: string, ip: string) {
    return {
      id: id,
      jsonrpc: '2.0',
      method: TEST_METHOD,
      params: [null],
    };
  }

  async function makeRequestWithForwardedIP(ip: string, id: string = '1') {
    return testClient.post('/', createRequestWithIP(id, ip), {
      headers: {
        'X-Forwarded-For': ip,
      },
    });
  }

  async function makeRequestWithoutForwardedIP(id: string = '1') {
    return testClient.post('/', createRequestWithIP(id, ''));
  }

  async function makeRequestWithForwardedHeader(forwardedValue: string, id: string = '1') {
    return testClient.post('/', createRequestWithIP(id, ''), {
      headers: {
        Forwarded: forwardedValue,
      },
    });
  }

  it('should use X-Forwarded-For header IP for rate limiting when app.proxy is true', async function () {
    // Make requests up to the rate limit for IP_A using X-Forwarded-For header
    const responses: AxiosResponse[] = [];

    // Make requests within the limit (TIER_2_RATE_LIMIT = 3)
    for (let i = 1; i <= 3; i++) {
      const response = await makeRequestWithForwardedIP(TEST_IP_A, i.toString());
      responses.push(response);

      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    }

    // The next request should be rate limited for IP_A
    try {
      await makeRequestWithForwardedIP(TEST_IP_A, '4');
      expect.fail('Expected rate limit to be exceeded');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605); // IP Rate Limit Exceeded
      expect(error.response.data.error.message).to.include('IP Rate limit exceeded');
    }
  });

  it('should treat different X-Forwarded-For IPs independently', async function () {
    // First, exhaust the rate limit for TEST_IP_B
    for (let i = 1; i <= 3; i++) {
      await makeRequestWithForwardedIP(TEST_IP_B, `b${i}`);
    }

    // Verify TEST_IP_B is rate limited
    try {
      await makeRequestWithForwardedIP(TEST_IP_B, 'b4');
      expect.fail('Expected rate limit to be exceeded for TEST_IP_B');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605);
    }

    // Now make requests with TEST_IP_C - should not be rate limited
    for (let i = 1; i <= 3; i++) {
      const response = await makeRequestWithForwardedIP(TEST_IP_C, `c${i}`);
      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    }

    // TEST_IP_C should also get rate limited after hitting its own limit
    try {
      await makeRequestWithForwardedIP(TEST_IP_C, 'c4');
      expect.fail('Expected rate limit to be exceeded for TEST_IP_C');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605);
    }
  });

  it('should use actual client IP when X-Forwarded-For header is not present', async function () {
    // Make requests without X-Forwarded-For header
    // These should use the actual client IP and have their own rate limit
    for (let i = 1; i <= 3; i++) {
      const response = await makeRequestWithoutForwardedIP(i.toString());
      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    }

    // The next request should be rate limited for the actual client IP
    try {
      await makeRequestWithoutForwardedIP('4');
      expect.fail('Expected rate limit to be exceeded for actual client IP');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605);
    }
  });

  it('should handle multiple IPs in X-Forwarded-For header (use first IP)', async function () {
    // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
    // Koa should use the first IP (leftmost) as the client IP
    const multipleIPs = `${TEST_IP_D}, 10.0.0.1, 10.0.0.2`;

    // Make requests with multiple IPs in the header
    for (let i = 1; i <= 3; i++) {
      const response = await testClient.post('/', createRequestWithIP(i.toString(), TEST_IP_D), {
        headers: {
          'X-Forwarded-For': multipleIPs,
        },
      });

      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    }

    // Should be rate limited based on the first IP (TEST_IP_D)
    try {
      await testClient.post('/', createRequestWithIP('4', TEST_IP_D), {
        headers: {
          'X-Forwarded-For': multipleIPs,
        },
      });
      expect.fail('Expected rate limit to be exceeded for first IP in X-Forwarded-For');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605);
    }
  });

  it('should properly handle X-Forwarded-For header with different request patterns', async function () {
    // Make requests with X-Forwarded-For header
    for (let i = 1; i <= 3; i++) {
      const response = await testClient.post('/', createRequestWithIP(i.toString(), TEST_IP_E), {
        headers: {
          'X-Forwarded-For': TEST_IP_E,
        },
      });

      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    }

    // Next request should be rate limited
    try {
      await testClient.post('/', createRequestWithIP('4', TEST_IP_E), {
        headers: {
          'X-Forwarded-For': TEST_IP_E,
        },
      });
      expect.fail('Expected rate limit to be exceeded');
    } catch (error: any) {
      expect(error.response.status).to.eq(429);
      expect(error.response.data.error.code).to.eq(-32605);
    }
  });

  describe('Forwarded Header Tests', function () {
    it('should parse RFC 7239 Forwarded header with quoted IP and use for rate limiting', async function () {
      // Test with quoted IP format: for="192.168.6.100"
      const forwardedHeader = `for="${TEST_IP_F}"`;

      // Make requests up to the rate limit
      for (let i = 1; i <= 3; i++) {
        const response = await makeRequestWithForwardedHeader(forwardedHeader, `f${i}`);
        expect(response.status).to.eq(200);
        expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
      }

      // The next request should be rate limited
      try {
        await makeRequestWithForwardedHeader(forwardedHeader, 'f4');
        expect.fail('Expected rate limit to be exceeded for Forwarded header IP');
      } catch (error: any) {
        expect(error.response.status).to.eq(429);
        expect(error.response.data.error.code).to.eq(-32605);
      }
    });

    it('should parse Forwarded header with unquoted IP', async function () {
      // Test with unquoted IP format: for=192.168.7.100
      const forwardedHeader = `for=${TEST_IP_G}`;

      // Make requests up to the rate limit
      for (let i = 1; i <= 3; i++) {
        const response = await makeRequestWithForwardedHeader(forwardedHeader, `g${i}`);
        expect(response.status).to.eq(200);
        expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
      }

      // The next request should be rate limited
      try {
        await makeRequestWithForwardedHeader(forwardedHeader, 'g4');
        expect.fail('Expected rate limit to be exceeded for unquoted Forwarded IP');
      } catch (error: any) {
        expect(error.response.status).to.eq(429);
        expect(error.response.data.error.code).to.eq(-32605);
      }
    });

    it('should parse Forwarded header with IPv6 address in brackets', async function () {
      // Test with IPv6 format: for="[2001:db8::1]"
      const forwardedHeader = `for="[${TEST_IPV6}]"`;

      // Make requests up to the rate limit
      for (let i = 1; i <= 3; i++) {
        const response = await makeRequestWithForwardedHeader(forwardedHeader, `ipv6_${i}`);
        expect(response.status).to.eq(200);
        expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
      }

      // The next request should be rate limited
      try {
        await makeRequestWithForwardedHeader(forwardedHeader, 'ipv6_4');
        expect.fail('Expected rate limit to be exceeded for IPv6 Forwarded IP');
      } catch (error: any) {
        expect(error.response.status).to.eq(429);
        expect(error.response.data.error.code).to.eq(-32605);
      }
    });

    it('should handle multiple entries in Forwarded header (use first IP)', async function () {
      // Test with multiple forwarded entries - should use the first one
      const forwardedHeader = `for="${TEST_IP_H}";by="10.0.0.1", for="203.0.113.1";by="10.0.0.2"`;

      // Make requests up to the rate limit
      for (let i = 1; i <= 3; i++) {
        const response = await makeRequestWithForwardedHeader(forwardedHeader, `h${i}`);
        expect(response.status).to.eq(200);
        expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
      }

      // The next request should be rate limited based on first IP (TEST_IP_H)
      try {
        await makeRequestWithForwardedHeader(forwardedHeader, 'h4');
        expect.fail('Expected rate limit to be exceeded for first IP in Forwarded header');
      } catch (error: any) {
        expect(error.response.status).to.eq(429);
        expect(error.response.data.error.code).to.eq(-32605);
      }
    });

    it('should not override X-Forwarded-For when both headers are present', async function () {
      // When both X-Forwarded-For and Forwarded are present, X-Forwarded-For should take precedence
      const forwardedHeader = `for="${TEST_IP_I}"`;

      // Make requests with both headers - should be rate limited by X-Forwarded-For IP (TEST_IP_J)
      for (let i = 1; i <= 3; i++) {
        const response = await testClient.post('/', createRequestWithIP(`j${i}`, TEST_IP_J), {
          headers: {
            'X-Forwarded-For': TEST_IP_J,
            Forwarded: forwardedHeader,
          },
        });
        expect(response.status).to.eq(200);
        expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
      }

      // Should be rate limited based on X-Forwarded-For IP (TEST_IP_J), not Forwarded IP (TEST_IP_I)
      try {
        await testClient.post('/', createRequestWithIP('j4', TEST_IP_J), {
          headers: {
            'X-Forwarded-For': TEST_IP_J,
            Forwarded: forwardedHeader,
          },
        });
        expect.fail('Expected rate limit to be exceeded for X-Forwarded-For IP');
      } catch (error: any) {
        expect(error.response.status).to.eq(429);
        expect(error.response.data.error.code).to.eq(-32605);
      }

      // Verify that the Forwarded header IP (TEST_IP_I) is not rate limited
      const response = await makeRequestWithForwardedHeader(forwardedHeader, 'i1');
      expect(response.status).to.eq(200);
      expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
    });

    withOverriddenEnvsInMochaTest({ RATE_LIMIT_DISABLED: 'true' }, () => {
      it('should handle malformed Forwarded header gracefully', async function () {
        // Test with malformed Forwarded header - should fall back to actual client IP
        // Rate limiting disabled for this test to avoid conflicts with other tests using actual client IP
        const malformedHeaders = [
          'invalid_format',
          'for=',
          'for=""',
          'proto=https', // No 'for' parameter
        ];

        for (const malformedHeader of malformedHeaders) {
          const response = await makeRequestWithForwardedHeader(malformedHeader, '1');
          expect(response.status).to.eq(200);
          expect(response.data.result).to.be.equal(ConfigService.get('CHAIN_ID'));
        }
      });
    });
  });
});
