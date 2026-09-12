// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAgentRegistry {
    event AgentRegistered(address indexed agent, string metadata);
    event AgentRevoked(address indexed agent);

    function registerAgent(address agent, string calldata metadata) external;
    function revokeAgent(address agent) external;
    function isAuthorizedAgent(address agent) external view returns (bool);
    function getAgents() external view returns (address[] memory);
    function agentCount() external view returns (uint256);
}

contract AgentRegistry is IAgentRegistry, Ownable {
    mapping(address => bool) private _authorized;
    mapping(address => string) public agentMetadata;
    address[] private _agents;

    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    function registerAgent(address agent, string calldata metadata) external override onlyOwner {
        require(agent != address(0), "AgentRegistry: zero address");
        if (!_authorized[agent]) {
            _authorized[agent] = true;
            _agents.push(agent);
        }
        agentMetadata[agent] = metadata;
        emit AgentRegistered(agent, metadata);
    }

    function revokeAgent(address agent) external override onlyOwner {
        require(_authorized[agent], "AgentRegistry: not authorized");
        _authorized[agent] = false;
        emit AgentRevoked(agent);
    }

    function isAuthorizedAgent(address agent) external view override returns (bool) {
        return _authorized[agent];
    }

    function getAgents() external view override returns (address[] memory) {
        return _agents;
    }

    function agentCount() external view override returns (uint256) {
        return _agents.length;
    }
}
