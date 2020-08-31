pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import "./Governable.sol";

/*
*   This contract is to ensure our users will not get exit-scammed
*   while retaining the possibility of providing new rewards.
*
*   The governance has to announce the minting first and wait for the
*   `duration`. Only after that `duration` is passed, can the governance
*   create new rewards.
*
*   The usage of this contract itself does not mean it is free from exit-scam.
*   Thus we provide some guidance for the user on how to check.
*
*   User due diligence guide:
*     [1] DelayMinter has to be the only type of Minters for the RewardToken
*
*     [2] The ownership of RewardToken has to be renounced
*         (to ensure no new minters can be added)
*
*     [3] The duration of all DelayMinters should be set to a reasonable time.
*         The numbers reported are in seconds.
*
*
*   Only then, the users are free from exit scams.
*
*/

contract DelayMinter is Governable {
  using SafeMath for uint256;

  struct MintingAnnouncement{
    address target;
    uint256 amount;
    uint256 timeToMint;
  }

  address public team;
  address public operator;

  uint256 public lpRatio =        70;
  uint256 public teamRatio =      20; // not used, but keeping for clarity
  uint256 public operationRatio = 10;
  uint256 public totalRatio =     100;

  address public token;
  uint256 public delay;

  uint256 public nextId;

  // announcements[_id] returns Minting announcement struct
  mapping (uint256 => MintingAnnouncement) announcements;

  // Note that not all amount goes to the target
  // it would be distributed according to the predefined ratio
  // target will get (lpRatio/totalRatio * amount)
  event MintingAnnounced(uint256 id, address target, uint256 _amount, uint256 timeActive);

  event CancelMinting(uint256 id);
  event NewTeam(address team);
  event NewOperator(address operator);

  constructor(address _storage, address _token, uint256 _delay, address _team, address _operator)
  Governable(_storage) public {
    token = _token;
    require(token != address(0), "token not set");
    delay = _delay;
    require(delay != 0, "delay not set");
    team = _team;
    require(team != address(0), "team not set");
    operator = _operator;
    require(operator != address(0), "operator not set");
    nextId = 0;
  }

  // Note that not all amount goes to the target
  // it would be distributed according to the predefined ratio
  // target will get (lpRatio/totalRatio * amount)
  function announceMint(address _target, uint256 _amount) public onlyGovernance {
    require(_target != address(0), "target cannot be 0x0 address");
    require(_amount != 0, "Amount should be greater than 0");

    uint256 timeToMint = block.timestamp + delay;
    // set the new minting
    announcements[nextId] = MintingAnnouncement(
      _target,
      _amount,
      timeToMint
    );
    emit MintingAnnounced(nextId, _target, _amount, timeToMint);
    // Overflow is unlikely to happen
    // furthermore, we can reuse the id even if it overflowed.
    nextId++;
  }

  // Governance can only mint if it is already announced and the delay has passed
  function executeMint(uint256 _id) public onlyGovernance {
    address target = announcements[_id].target;
    uint256 amount = announcements[_id].amount; // now this is the total amount

    require(target != address(0), "Minting needs to be first announced");
    require(amount != 0, "Amount should be greater than 0");
    require(block.timestamp >= announcements[_id].timeToMint, "Cannot mint yet");

    uint256 toTarget = amount.mul(lpRatio).div(totalRatio);
    uint256 toOperator = amount.mul(operationRatio).div(totalRatio);
    uint256 toTeam = amount.sub(toTarget).sub(toOperator);
    ERC20Mintable(token).mint(target, toTarget);
    ERC20Mintable(token).mint(operator, toOperator);
    ERC20Mintable(token).mint(team, toTeam);

    // clear out so that it prevents governance from reusing the announcement
    // it also saves gas and we can reuse the announcements even if the id overflowed
    delete announcements[_id];
  }

  function cancelMint(uint256 _id) public onlyGovernance {
    require(announcements[_id].target != address(0), "Minting needs to be first announced");
    require(announcements[_id].amount != 0, "Amount should be greater than 0");
    delete announcements[_id];
    emit CancelMinting(_id);
  }

  function setTeam(address _team) public onlyGovernance {
    require(_team != address(0), "Address should not be 0");
    team = _team;
    emit NewTeam(_team);
  }

  function setOperator(address _operator) public onlyGovernance {
    require(_operator != address(0), "Address should not be 0");
    operator = _operator;
    emit NewOperator(_operator);
  }

  function renounceMinting() public onlyGovernance {
    ERC20Mintable(token).renounceMinter();
  }
}
