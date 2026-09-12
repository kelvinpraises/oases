// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/registries/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner = address(this);
    address public agent1 = address(0x1111);
    address public agent2 = address(0x2222);
    address public nonOwner = address(0x9999);

    event AgentRegistered(address indexed agent, string metadata);
    event AgentRevoked(address indexed agent);

    function setUp() public {
        registry = new AgentRegistry(owner);
    }

    function testOwnerInitialization() public view {
        assertEq(registry.owner(), owner);
        assertEq(registry.agentCount(), 0);
    }

    function testRegisterAgent() public {
        string memory meta = '{"name":"Sentinel-1","version":"1.0"}';

        vm.expectEmit(true, false, false, true);
        emit AgentRegistered(agent1, meta);
        registry.registerAgent(agent1, meta);

        assertTrue(registry.isAuthorizedAgent(agent1));
        assertEq(registry.agentMetadata(agent1), meta);
        assertEq(registry.agentCount(), 1);

        address[] memory agents = registry.getAgents();
        assertEq(agents.length, 1);
        assertEq(agents[0], agent1);
    }

    function testRegisterAgentUpdatesMetadataWithoutDuplicate() public {
        registry.registerAgent(agent1, "initial");
        assertEq(registry.agentCount(), 1);

        registry.registerAgent(agent1, "updated");
        assertEq(registry.agentCount(), 1);
        assertEq(registry.agentMetadata(agent1), "updated");

        address[] memory agents = registry.getAgents();
        assertEq(agents.length, 1);
        assertEq(agents[0], agent1);
    }

    function testRegisterMultipleAgents() public {
        registry.registerAgent(agent1, "agent-1");
        registry.registerAgent(agent2, "agent-2");

        assertEq(registry.agentCount(), 2);
        assertTrue(registry.isAuthorizedAgent(agent1));
        assertTrue(registry.isAuthorizedAgent(agent2));

        address[] memory agents = registry.getAgents();
        assertEq(agents.length, 2);
        assertEq(agents[0], agent1);
        assertEq(agents[1], agent2);
    }

    function testRegisterZeroAddressReverts() public {
        vm.expectRevert("AgentRegistry: zero address");
        registry.registerAgent(address(0), "meta");
    }

    function testRegisterAgentOnlyOwner() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        registry.registerAgent(agent1, "meta");
    }

    function testRevokeAgent() public {
        registry.registerAgent(agent1, "agent-1");
        assertTrue(registry.isAuthorizedAgent(agent1));

        vm.expectEmit(true, false, false, false);
        emit AgentRevoked(agent1);
        registry.revokeAgent(agent1);

        assertFalse(registry.isAuthorizedAgent(agent1));
    }

    function testRevokeUnregisteredAgentReverts() public {
        vm.expectRevert("AgentRegistry: not authorized");
        registry.revokeAgent(agent1);
    }

    function testRevokeAgentOnlyOwner() public {
        registry.registerAgent(agent1, "agent-1");

        vm.prank(nonOwner);
        vm.expectRevert();
        registry.revokeAgent(agent1);
    }

    function testUnauthorizedAgentReturnsFalse() public view {
        assertFalse(registry.isAuthorizedAgent(agent1));
        assertFalse(registry.isAuthorizedAgent(address(0)));
    }

    function testConstructorZeroOwnerReverts() public {
        vm.expectRevert("AgentRegistry: zero owner");
        new AgentRegistry(address(0));
    }

    function testSwapAndPopIndexAccuracy() public {
        address agent3 = address(0x3333);
        registry.registerAgent(agent1, "meta-1");
        registry.registerAgent(agent2, "meta-2");
        registry.registerAgent(agent3, "meta-3");
        assertEq(registry.agentCount(), 3);

        // Revoke middle agent (agent2)
        registry.revokeAgent(agent2);
        assertEq(registry.agentCount(), 2);
        assertFalse(registry.isAuthorizedAgent(agent2));
        assertEq(registry.agentMetadata(agent2), "");

        address[] memory agentsAfterMiddle = registry.getAgents();
        assertEq(agentsAfterMiddle.length, 2);
        assertEq(agentsAfterMiddle[0], agent1);
        assertEq(agentsAfterMiddle[1], agent3);

        // Revoke first agent (agent1)
        registry.revokeAgent(agent1);
        assertEq(registry.agentCount(), 1);
        assertFalse(registry.isAuthorizedAgent(agent1));
        address[] memory agentsAfterFirst = registry.getAgents();
        assertEq(agentsAfterFirst.length, 1);
        assertEq(agentsAfterFirst[0], agent3);

        // Revoke last remaining agent (agent3)
        registry.revokeAgent(agent3);
        assertEq(registry.agentCount(), 0);
        assertFalse(registry.isAuthorizedAgent(agent3));
        assertEq(registry.getAgents().length, 0);
    }

    function testRevokeSingleAgentCleansUp() public {
        registry.registerAgent(agent1, "meta-1");
        assertEq(registry.agentCount(), 1);

        registry.revokeAgent(agent1);
        assertEq(registry.agentCount(), 0);
        assertFalse(registry.isAuthorizedAgent(agent1));
        assertEq(registry.agentMetadata(agent1), "");
        assertEq(registry.getAgents().length, 0);
    }

    function testReRegisterAfterRevocation() public {
        registry.registerAgent(agent1, "initial-meta");
        registry.revokeAgent(agent1);
        assertFalse(registry.isAuthorizedAgent(agent1));

        registry.registerAgent(agent1, "re-registered-meta");
        assertTrue(registry.isAuthorizedAgent(agent1));
        assertEq(registry.agentMetadata(agent1), "re-registered-meta");
        assertEq(registry.agentCount(), 1);
        address[] memory agents = registry.getAgents();
        assertEq(agents.length, 1);
        assertEq(agents[0], agent1);
    }
}
