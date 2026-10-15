// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Fixed-supply demo token. No owner, mint, burn, tax, upgrade or pool replacement authority.
contract ThroneToken {
    string public constant name = "Throne Demo";
    string public constant symbol = "THRONE";
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InvalidRecipient();
    error InvalidSupply();
    error InsufficientBalance();
    error InsufficientAllowance();
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(address launchPayer, uint256 initialSupply) {
        if (launchPayer == address(0)) revert InvalidRecipient();
        if (initialSupply == 0) revert InvalidSupply();
        totalSupply = initialSupply;
        balanceOf[launchPayer] = totalSupply;
        emit Transfer(address(0), launchPayer, totalSupply);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[from][msg.sender];
        if (permitted != type(uint256).max) {
            if (permitted < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = permitted - amount;
            emit Approval(from, msg.sender, permitted - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidRecipient();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
