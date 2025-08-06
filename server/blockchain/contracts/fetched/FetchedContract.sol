// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract SimpleStorage2 {
    uint256 private storedValue;
    address public owner;
    mapping(address => uint256) public deposits;
    
    event ValueUpdated(uint256 newValue, address updatedBy);
    event EtherReceived(address from, uint256 amount);
    event EtherWithdrawn(address to, uint256 amount);
    
    constructor() {
        owner = msg.sender;
        storedValue = 0;
    }
    
    // Store a value
    function store(uint256 num) public {
        storedValue = num;
        emit ValueUpdated(num, msg.sender);
    }
    
    // Retrieve the stored value
    function retrieve() public view returns (uint256) {
        return storedValue;
    }
    
    // Get contract balance
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
    
    // Get deposit amount for an address
    function getDeposit(address user) public view returns (uint256) {
        return deposits[user];
    }
    
    // Withdraw function (only owner)
    function withdraw(uint256 amount) public {
        require(msg.sender == owner, "Only owner can withdraw");
        require(address(this).balance >= amount, "Insufficient balance");
        
        payable(owner).transfer(amount);
        emit EtherWithdrawn(owner, amount);
    }
    
    // Receive function - accepts ETH transfers
    receive() external payable {
        deposits[msg.sender] += msg.value;
        emit EtherReceived(msg.sender, msg.value);
    }
    
    // Fallback function - handles calls with data
    fallback() external payable {
        deposits[msg.sender] += msg.value;
        emit EtherReceived(msg.sender, msg.value);
    }
}