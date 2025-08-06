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
    function store(uint256 num) public {
        storedValue = num;
        emit ValueUpdated(num, msg.sender);
    }
    function retrieve() public view returns (uint256) {
        return storedValue;
    }
    
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
    
    function withdraw(uint256 amount) public {
        require(msg.sender == owner, "Only owner can withdraw");
        require(address(this).balance >= amount, "Insufficient balance");
        payable(owner).transfer(amount);
        emit EtherWithdrawn(owner, amount);
    }
    
    receive() external payable {
        deposits[msg.sender] += msg.value;
        emit EtherReceived(msg.sender, msg.value);
    }

    fallback() external payable {
        deposits[msg.sender] += msg.value;
        emit EtherReceived(msg.sender, msg.value);
    }
}