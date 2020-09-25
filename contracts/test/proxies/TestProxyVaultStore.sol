pragma solidity 0.5.16;

import "../../proxy_vault/ProxyVaultStore.sol";

contract TestProxyVaultStore is ProxyVaultStore {
    constructor() public {
        _setName('name');
        _setSymbol('symbol');
    }

    function name() public view returns (string memory) {
        return _name();
    }

    function setName(string calldata _name) external {
        _setName(bytes(_name));
    }

    function symbol() public view returns (string memory) {
        return _symbol();
    }

    function setSymbol(string calldata _symbol) external {
        _setSymbol(bytes(_symbol));
    }
}
