// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Protocol is Ownable {
    address public marketRegistry;
    address public vault;
    address public dripsStreaming;
    address public marketDriver;
    address public vaultDriver;
    address public agentRegistry;
    address public treasury;

    event MarketRegistrySet(address indexed marketRegistry);
    event VaultSet(address indexed vault);
    event DripsStreamingSet(address indexed dripsStreaming);
    event MarketDriverSet(address indexed marketDriver);
    event VaultDriverSet(address indexed vaultDriver);
    event AgentRegistrySet(address indexed agentRegistry);
    event TreasurySet(address indexed treasury);

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    function setMarketRegistry(address addr) external onlyOwner {
        _setOnce(marketRegistry, addr);
        marketRegistry = addr;
        emit MarketRegistrySet(addr);
    }

    function setVault(address addr) external onlyOwner {
        _setOnce(vault, addr);
        vault = addr;
        emit VaultSet(addr);
    }

    function setDripsStreaming(address addr) external onlyOwner {
        _setOnce(dripsStreaming, addr);
        dripsStreaming = addr;
        emit DripsStreamingSet(addr);
    }

    function setMarketDriver(address addr) external onlyOwner {
        _setOnce(marketDriver, addr);
        marketDriver = addr;
        emit MarketDriverSet(addr);
    }

    function setVaultDriver(address addr) external onlyOwner {
        _setOnce(vaultDriver, addr);
        vaultDriver = addr;
        emit VaultDriverSet(addr);
    }

    function setAgentRegistry(address addr) external onlyOwner {
        _setOnce(agentRegistry, addr);
        agentRegistry = addr;
        emit AgentRegistrySet(addr);
    }

    function setTreasury(address addr) external onlyOwner {
        _setOnce(treasury, addr);
        treasury = addr;
        emit TreasurySet(addr);
    }

    function _setOnce(address current, address next) private pure {
        require(current == address(0), "Protocol: already set");
        require(next != address(0), "Protocol: zero address");
    }
}
