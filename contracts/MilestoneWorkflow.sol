// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Educational local-network workflow. Amounts are fictional KZT units.
/// @dev No payable functions, token transfers, external calls or real custody.
contract MilestoneWorkflow {
    enum State { Empty, Created, Reserved, Submitted, Disputed, Approved, Settled }
    struct Milestone {
        address client;
        address freelancer;
        uint256 amount;
        bytes32 termsHash;
        bytes32 evidenceHash;
        State state;
        uint16 releaseBps;
        uint256 released;
        uint256 refunded;
    }

    address public immutable admin;
    address public immutable arbiter;
    address public immutable adapter;
    bool public paused;
    uint256 public nextId = 1;
    mapping(uint256 => Milestone) public milestones;
    mapping(bytes32 => bool) public usedReservationRefs;
    mapping(bytes32 => bool) public usedSettlementRefs;

    event Created(uint256 indexed id, address indexed client, address indexed freelancer, uint256 amount);
    event ReservationConfirmed(uint256 indexed id, bytes32 referenceHash);
    event EvidenceSubmitted(uint256 indexed id, bytes32 evidenceHash);
    event DisputeOpened(uint256 indexed id);
    event SettlementApproved(uint256 indexed id, uint16 releaseBps);
    event SettlementConfirmed(uint256 indexed id, uint256 released, uint256 refunded, bytes32 referenceHash);
    event PauseChanged(bool paused);

    modifier active() { require(!paused, "Paused"); _; }
    modifier onlyAdapter() { require(msg.sender == adapter, "Adapter only"); _; }

    constructor(address arbiter_, address adapter_) {
        require(arbiter_ != address(0) && adapter_ != address(0), "Zero role");
        require(arbiter_ != adapter_ && arbiter_ != msg.sender && adapter_ != msg.sender, "Separate privileged roles");
        admin = msg.sender;
        arbiter = arbiter_;
        adapter = adapter_;
    }

    function create(address freelancer, uint256 amount, bytes32 termsHash) external active returns (uint256 id) {
        require(freelancer != address(0) && freelancer != msg.sender, "Invalid freelancer");
        require(amount > 0 && termsHash != bytes32(0), "Invalid terms");
        id = nextId++;
        milestones[id] = Milestone(msg.sender, freelancer, amount, termsHash, bytes32(0), State.Created, 0, 0, 0);
        emit Created(id, msg.sender, freelancer, amount);
    }

    function reserve(uint256 id, bytes32 referenceHash) external active onlyAdapter {
        Milestone storage m = milestones[id];
        require(m.state == State.Created, "Expected Created");
        require(referenceHash != bytes32(0) && !usedReservationRefs[referenceHash], "Invalid reservation reference");
        usedReservationRefs[referenceHash] = true;
        m.state = State.Reserved;
        emit ReservationConfirmed(id, referenceHash);
    }

    function submit(uint256 id, bytes32 evidenceHash) external active {
        Milestone storage m = milestones[id];
        require(msg.sender == m.freelancer, "Freelancer only");
        require(m.state == State.Reserved, "Expected Reserved");
        require(evidenceHash != bytes32(0), "Empty evidence");
        m.evidenceHash = evidenceHash;
        m.state = State.Submitted;
        emit EvidenceSubmitted(id, evidenceHash);
    }

    function approve(uint256 id) external active {
        Milestone storage m = milestones[id];
        require(msg.sender == m.client, "Client only");
        require(m.state == State.Submitted, "Expected Submitted");
        m.releaseBps = 10000;
        m.state = State.Approved;
        emit SettlementApproved(id, 10000);
    }

    function dispute(uint256 id) external active {
        Milestone storage m = milestones[id];
        require(msg.sender == m.client || msg.sender == m.freelancer, "Party only");
        require(m.state == State.Submitted, "Expected Submitted");
        m.state = State.Disputed;
        emit DisputeOpened(id);
    }

    function resolve(uint256 id, uint16 releaseBps) external active {
        require(msg.sender == arbiter, "Arbiter only");
        Milestone storage m = milestones[id];
        require(m.state == State.Disputed, "Expected Disputed");
        require(releaseBps <= 10000, "Invalid split");
        m.releaseBps = releaseBps;
        m.state = State.Approved;
        emit SettlementApproved(id, releaseBps);
    }

    function confirmSettlement(uint256 id, bytes32 referenceHash) external active onlyAdapter {
        Milestone storage m = milestones[id];
        require(m.state == State.Approved, "Expected Approved");
        require(referenceHash != bytes32(0) && !usedSettlementRefs[referenceHash], "Invalid settlement reference");
        usedSettlementRefs[referenceHash] = true;
        m.released = m.amount * m.releaseBps / 10000;
        m.refunded = m.amount - m.released;
        m.state = State.Settled;
        emit SettlementConfirmed(id, m.released, m.refunded, referenceHash);
    }

    function setPaused(bool value) external {
        require(msg.sender == admin, "Admin only");
        paused = value;
        emit PauseChanged(value);
    }
}
