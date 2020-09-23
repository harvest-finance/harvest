pragma solidity 0.5.16;

import "./GovernableProxy.sol";

// Ensures that upgrades occur after a mandatory waiting period. One queued
// update is stored and automatically activated at a specific timestamp
contract TimelockedProxy is GovernableProxy {

    // the number of seconds to delay a change
    bytes32 private constant _TIMER_SLOT = 0x16ea8945dccfd60816131e877e35fb4c75542f840cf8432eafe6a82aec3fb393;

    // the new target at the change
    bytes32 private constant _NEXT_SLOT = 0x8f58a16f4dc0b4ae97b4b89fc992033e37fc1602778ac3cb5502d7138bee1d0e;

    // the timestamp when the change happens
    bytes32 private constant _SCHEDULED_SLOT = 0x3889c1d17c017840e6a02a4d3c18713f27a6ff8fca4bcba0a7c4e42c9b49c6ec;

    constructor(address _logic, bytes memory _data, address _admin, address _governance, uint256 _timer)
    GovernableProxy(_logic, _data, _admin, _governance)
    public
    {
        assert(_TIMER_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Things long Past")) - 1));
        assert(_NEXT_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Waiting in the Wings")) - 1));
        assert(_SCHEDULED_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Things yet to Come")) - 1));
        _setTimer(_timer);
    }

    function _setNext(address _nextImpl) private {
        bytes32 slot = _NEXT_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, _nextImpl)
        }
    }

    function _setTimer(uint256 _tim) private {
        bytes32 slot = _TIMER_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, _tim)
        }
    }

    function _setScheduled(uint256 _sched) private {
        bytes32 slot = _SCHEDULED_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, _sched)
        }
    }

    function _timer() internal view returns (uint256 tim) {
        bytes32 slot = _TIMER_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            tim := sload(slot)
        }
    }

    function _scheduled() internal view returns (uint256 tim) {
        bytes32 slot = _SCHEDULED_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            tim := sload(slot)
        }
    }

    function _next() internal view returns (address nxt) {
        bytes32 slot = _NEXT_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            nxt := sload(slot)
        }
    }

    function timer() external view returns (uint256) {
        return _scheduled();
    }

    function scheduledChange() external view returns (uint256) {
        return _scheduled();
    }

    function next() external view returns (address) {
        return _next();
    }

    function setNext(address _nextImpl) ifAdmin external {
        uint32 extSize;
        assembly {
            extSize := extcodesize(_nextImpl)
        }
        require(extSize != 0, "TimelockedProxy: new implementation is not a contract");

        _setNext(_nextImpl);
        _setScheduled(block.timestamp + _timer());
    }

    // main logic. if the timer has elapsed and there is a next,
    // upgrade to it
    function _beforeFallback() internal {
        uint256 scheduled = _scheduled();
        // break up the conditions to save a SLOAD on most calls
        if (scheduled != 0 && block.timestamp > scheduled) {
            uint256 nextImpl = _next();
            if (nextImpl != address(0)) {
                _upgradeTo(nextImpl);
                _setNext(address(0));
                _setScheduled(0);
            }
        }
        super._beforeFallback();
    }
}
