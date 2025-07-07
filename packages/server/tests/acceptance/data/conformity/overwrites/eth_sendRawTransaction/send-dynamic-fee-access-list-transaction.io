// sends a transaction with dynamic fee and access list
// Reason for override: This test uses data included in the chain.rlp
// https://github.com/ethereum/execution-apis/blob/main/tests/chain.rlp
//
// Since we do not replay those transactions before starting the tests, we need a separate test that simulates
// the same scenario.
//
// Note: This is the original test file, modified for our test purposes:
// https://github.com/ethereum/execution-apis/blob/main/tests/eth_sendRawTransaction/send-dynamic-fee-access-list-transaction.io

>> {"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":["0x02f88c83aa36a78084773594008506fc23ac008261a89467d8d32e9bf1a9968a5ff53b87d777aa8ebbee69872386f26fc1000080d7d69467d8d32e9bf1a9968a5ff53b87d777aa8ebbee69c001a01b39fcf43c10acf60445c7b8796759bbe46b496d580953c559240c4d940c9dc4a00f866cb12cb33f7bff97cf8a8516cc1f8d3ab6fd3201ade6f4d1af5f92798d6b"]}
<< {"jsonrpc":"2.0","id":1,"result":"0xe99dd0c902189a3a86bdc5551eb9f6230df5c1dde8a5869963b1197c5bb13c65"}