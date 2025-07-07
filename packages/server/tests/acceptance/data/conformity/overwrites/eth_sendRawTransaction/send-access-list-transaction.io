// sends a transaction with access list
// Reason for override: This test uses data included in the chain.rlp
// https://github.com/ethereum/execution-apis/blob/main/tests/chain.rlp
//
// Since we do not replay those transactions before starting the tests, we need a separate test that simulates
// the same scenario.
//
// Note: This is the original test file, modified for our test purposes:
// https://github.com/ethereum/execution-apis/blob/main/tests/eth_sendRawTransaction/send-access-list-transaction.io

>> {"jsonrpc":"2.0","id":1,"method":"eth_sendRawTransaction","params":["0x01f88783aa36a7808504a817c8008261a89467d8d32e9bf1a9968a5ff53b87d777aa8ebbee69872386f26fc1000080d7d69467d8d32e9bf1a9968a5ff53b87d777aa8ebbee69c001a033f979b49e404e079e6efdcd24f461f776dbffa64cbe46a30241fe378da6c68da02423fbd1c1e50eeae47e50918b4821ad20ff9f370d9984439c039f1610c2664d"]}
<< {"jsonrpc":"2.0","id":1,"result":"0x26cc539c6475a58ae7bee59e17b2e0e6ae65d89a70e2976e8243272012dca988"}