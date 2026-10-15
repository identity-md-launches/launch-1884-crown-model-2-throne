// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ThroneToken} from "../src/ThroneToken.sol";

contract ThroneTokenTest is Test {
    function testConstructorRequiresExplicitPayerAndNonzeroSupply() public {
        address payer = makeAddr("payer");
        vm.expectRevert(ThroneToken.InvalidRecipient.selector);
        new ThroneToken(address(0), 100);
        vm.expectRevert(ThroneToken.InvalidSupply.selector);
        new ThroneToken(payer, 0);
        ThroneToken token = new ThroneToken(payer, 42 ether);
        assertEq(token.totalSupply(), 42 ether);
        assertEq(token.balanceOf(payer), 42 ether);
    }

    function testFixedSupplyTransfersAllowancesAndInvalidRecipients() public {
        address payer = makeAddr("payer");
        address spender = makeAddr("spender");
        ThroneToken token = new ThroneToken(payer, 1_000_000_000 ether);
        assertEq(token.name(), "Throne Demo");
        assertEq(token.symbol(), "THRONE");
        assertEq(token.decimals(), 18);
        assertEq(token.balanceOf(payer), token.totalSupply());
        vm.prank(payer);
        token.approve(spender, 10 ether);
        vm.prank(spender);
        assertTrue(token.transferFrom(payer, spender, 4 ether));
        assertEq(token.allowance(payer, spender), 6 ether);
        assertEq(token.balanceOf(spender), 4 ether);
        vm.prank(spender);
        vm.expectRevert(ThroneToken.InsufficientAllowance.selector);
        token.transferFrom(payer, spender, 7 ether);
        vm.prank(payer);
        vm.expectRevert(ThroneToken.InvalidRecipient.selector);
        token.transfer(address(0), 1);
        vm.expectRevert(ThroneToken.InsufficientBalance.selector);
        token.transfer(payer, 1);
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", spender, 1));
        assertFalse(ok);
        assertEq(token.totalSupply(), 1_000_000_000 ether);
    }
}
