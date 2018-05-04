pragma experimental "v0.5.0";

////////////////////
//   HOURLY PAY   //
//    CONTRACT    //
//     v 0.1      //
////////////////////

// The Hourly Pay Contract allows you to track your time and get paid a hourly wage for tracked time.
//
// HOW IT WORKS:
//
//  1. Client creates the contract with contractor, making the client the owner of the contract.
//
//  2. Client can fund the contract with ETH by simply sending money to the contract (via payable fallback function).
//
//  3. Before hiring someone, client can change additional parameters, such as:
//
//      - setContractDurationInDays(days) - The duration of the contract (default is 365 days).
//
//      - setDailyHourLimit(hours) - How much hours the Employee can work per day (default is 8 hours).
//
//      - setPaydayFrequencyInDays(days) - How often the Employee can withdraw the earnings (default is every 3 days).
//
//      - setBeginTimeTS(utcTimestamp) - Work on contract can be started after this timestamp (default is contract creation time).
//                                       Also defines the start of Day and Week for accounting and daily limits.
//                                       Day transition time should be convenient for the employee (like 4am), so that work doesn't cross between days,
//                                       The excess won't be transferred to the next day.
//
//  4. Client hires the Employee by invoking hire(addressOfEmployee, ratePerHourInWei)
//     This starts the project and puts the contract in a workable state.
//     Contract has to be loaded with enough ETH to provide at least one day of work at specified ratePerHourInWei
// 
//  5. To start work and earn ETH the Employee should:
//
//      invoke startWork() when he starts working to run the timer.
//
//      invoke stopWork() when he finishes working to stop the timer.
//
//    After the timer is stopped - the ETH earnings are calculated and recorded on Employee's internal balance.
//    If the stopWork() is invoked after more hours had passed than dailyLimit - the excess is ignored and only the dailyLimit is added to the internal balance.
//
//  6. Employee can withdraw earnings from internal balance after paydayFrequencyInDays days have passed after BeginTimeTS:
//      by invoking withdraw()
//
//    After each withdrawal the paydayFrequencyInDays is reset and starts counting itself from the TS of withdrawal.
//
//    This delay is implemented as a safety mechanism, so the Client can have time to check the work and cancel the earnings if something goes wrong.
//    That way only money earned during the last paydayFrequencyInDays is at risk.
//
//  7. Client can fire() the Employee after his services are no longer needed.
//    That would stop any ongoing work by terminating the timer and won't allow to start the work again.
//
//  8. If anything in the relationship or hour counting goes wrong, there are safety functions:
//      - refund() - terminates all unwithdrawn earnings.
//      - refund(amount) - terminates the (amount) of unwithdrawn earnings.
//    Both of these can be called by Client or Employee.
//    Still need to think if allowing Client to do that won't hurt the Employee.
//
//  9. Client can withdraw any excess ETH from the contract via:
//      - clientWithdraw() - withdraws all funds minus locked in earnings.
//      - clientWithdraw(amount) - withdraws (amount), not locked in earnings.
//    Can be invoked only if Employee isn't hired or has been fired.
////////////////////////////////////////////////////////////////////////////////

contract HourlyPay { 

    ////////////////////////////////
    // Addresses

    address public owner;           // Client and owner address
    address public employeeAddress = 0x0;  // Employee address


    /////////////////////////////////
    // Contract business properties
    
    uint beginTimeTS;               // When the contract work can be started. Also TS of day transition.
    uint ratePerHourInWei;          // Employee rate in wei
    uint earnings = 0;              // Earnings of employee
    bool hired = false;             // If the employee is hired and approved to perform work
    bool working = false;           // Is employee currently working with timer on?
    uint startedWorkTS;             // Timestamp of when the timer started counting time
    uint workedTodayInSeconds = 0;  // How many seconds worked today
    uint currentDayTS;
    uint lastPaydayTS;


    ////////////////////////////////
    // Contract Limits and maximums
    
    uint16 contractDurationInDays = 365;  // Overall contract duration in days, default is 365 and it's also maximum for safety reasons
    uint8 dailyHourLimit = 8;               // Limits the hours per day, max 24 hours
    uint8 paydayFrequencyInDays = 3;       // How often can Withdraw be called, default is every 3 days

    uint8 constant hoursInWeek = 168;
    uint8 constant maxDaysInFrequency = 30; // every 30 days is a wise maximum


    ////////////////
    // Constructor

    constructor() public {
        owner = msg.sender;
        beginTimeTS = now;
        currentDayTS = beginTimeTS;
        lastPaydayTS = beginTimeTS;
    }


    //////////////
    // Modifiers

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    modifier onlyEmployee {
        require(msg.sender == employeeAddress);
        _;
    }
    
    modifier onlyOwnerOrEmployee {
        require((msg.sender == employeeAddress) || (msg.sender == owner));
        _;
    }

    modifier beforeHire {
        require(employeeAddress == 0x0);                        // Contract can hire someone only once
        require(hired == false);                                // Shouldn't be already hired
        _;
    }


    ///////////
    // Events
    
    event GotFunds(address indexed sender, uint indexed amount, uint indexed totalBalance);
    event ContractDurationInDaysChanged(uint16 indexed contractDurationInDays);
    event DailyHourLimitChanged(uint8 indexed dailyHourLimit);
    event PaydayFrequencyInDaysChanged(uint32 indexed paydayFrequencyInDays);
    event BeginTimeTSChanged(uint indexed beginTimeTS);
    event Hired(address indexed employeeAddress, uint indexed ratePerHourInWei, uint indexed hiredTS);
    event NewDay(uint indexed currentDayTS, uint16 indexed contractDaysLeft);
    event StartedWork(uint indexed startedWorkTS, uint indexed workedTodayInSeconds);
    event StoppedWork(uint indexed stoppedWorkTS, uint workedInSeconds, uint earned);
    event Withdrawal(uint indexed amount, address indexed employeeAddress, uint indexed withdrawalTS);
    event Fired(address indexed employeeAddress, uint indexed firedTS);
    event Refunded(uint indexed amount, address indexed whoInitiatedRefund, uint indexed refundTS);
    event ClientWithdrawal(uint indexed amount, uint indexed clientWithdrawalTS);
    
    ////////////////////////////////////////////////
    // Fallback function to fund contract with ETH
    
    function () external payable {
        emit GotFunds(msg.sender, msg.value, address(this).balance);
    }
    
    
    ////////////
    // Setters

    function setContractDurationInDays(uint16 newContractDurationInDays) external onlyOwner beforeHire {
        require(newContractDurationInDays < 365);
        contractDurationInDays = newContractDurationInDays;
        emit ContractDurationInDaysChanged(contractDurationInDays);
    }
    
    function setDailyHourLimit(uint8 newDailyHourLimit) external onlyOwner beforeHire {
        require(newDailyHourLimit <= 24);
        dailyHourLimit = newDailyHourLimit;
        emit DailyHourLimitChanged(dailyHourLimit);
    }

    function setPaydayFrequencyInDays(uint8 newPaydayFrequencyInDays) external onlyOwner beforeHire {
        require(newPaydayFrequencyInDays < maxDaysInFrequency);
        paydayFrequencyInDays = newPaydayFrequencyInDays;
        emit PaydayFrequencyInDaysChanged(paydayFrequencyInDays);
    }

    function setBeginTimeTS(uint newBeginTimeTS) external onlyOwner beforeHire {
        beginTimeTS = newBeginTimeTS;
        currentDayTS = beginTimeTS;
        lastPaydayTS = beginTimeTS;
        emit BeginTimeTSChanged(beginTimeTS);
    }

    
    ////////////////////////////
    // Main workflow functions

    function hire(address newEmployeeAddress, uint newRatePerHourInWei) external onlyOwner beforeHire {
        require(newEmployeeAddress != 0x0);                     // Protection from burning the ETH
        require(address(this).balance >= newRatePerHourInWei * dailyHourLimit);  // Should have minimum one day balance to hire
        employeeAddress = newEmployeeAddress;
        ratePerHourInWei = newRatePerHourInWei;
        
        emit Hired(employeeAddress, ratePerHourInWei, now);
    }

    function startWork() external onlyEmployee {
        require(hired == true);
        require(working == false);
        
        require(now > beginTimeTS); // can start working only after contract beginTimeTS
        require(now < beginTimeTS + (contractDurationInDays * 1 days)); // can't start after contractDurationInDays has passed since beginTimeTS
        
        checkForNewDay();
        
        require(workedTodayInSeconds < dailyHourLimit * 1 hours); // can't start if already approached dailyHourLimit

        require(address(this).balance > earnings); // balance must be greater than earnings        
        require(address(this).balance - earnings >= ratePerHourInWei * (dailyHourLimit * 1 hours - workedTodayInSeconds) / 1 hours); // balance minus earnings must be sufficient for at least 1 day of work minus workedTodayInSeconds
        
        startedWorkTS = now;
        working = true;
        
        emit StartedWork(startedWorkTS, workedTodayInSeconds);
    }
    
    function checkForNewDay() internal {
        if (now - currentDayTS > 1 days) { // new day
            while (currentDayTS < now) {
                currentDayTS += 1 days;
            }
            workedTodayInSeconds = 0;
            emit NewDay(currentDayTS, uint16 ((beginTimeTS + (contractDurationInDays * 1 days) - currentDayTS) / 1 days));
        }
    }
    
    function stopWork() external onlyEmployee {
 
        stopWorkInternal();
    }
    
    function stopWorkInternal() internal {
        require(hired == true);
        require(working == true);
    
        require(now > startedWorkTS); // just a temporary overflow check, in case of miners manipulate time
        
        
        uint newWorkedTodayInSeconds = workedTodayInSeconds + (now - startedWorkTS);
        if (newWorkedTodayInSeconds > dailyHourLimit * 1 hours) { // check for overflow
            newWorkedTodayInSeconds = dailyHourLimit * 1 hours;   // and assign max dailyHourLimit if there is an overflow
        }
        
        uint earned = (newWorkedTodayInSeconds - workedTodayInSeconds) * ratePerHourInWei;
        earnings += earned; // add new earned ETH to earnings
        
        workedTodayInSeconds = newWorkedTodayInSeconds; // updated todays works in seconds
        
        working = false;

        emit StoppedWork(now, newWorkedTodayInSeconds - workedTodayInSeconds, earned);
        
        checkForNewDay();
    }

    function withdraw() external onlyEmployee {
        require(working == false);
        require(earnings > 0);
        require(earnings <= address(this).balance);
        
        require(now - lastPaydayTS > paydayFrequencyInDays * 1 days); // check if payday frequency days passed after last withdrawal
        
        lastPaydayTS = now;
        uint amountToWithdraw = earnings;
        earnings = 0;
        
        employeeAddress.transfer(amountToWithdraw);
        
        emit Withdrawal(amountToWithdraw, employeeAddress, now);
    }
    
    function fire() external onlyOwner {
        if (working) stopWorkInternal(); // cease all motor functions if working
        
        hired = false; // fire
        
        emit Fired(employeeAddress, now);
    }

    function refund() external onlyOwnerOrEmployee {    // terminates all unwithdrawn earnings.
        require(earnings > 0);
        uint amount = earnings;
        earnings = 0;

        emit Refunded(amount, msg.sender, now);
    }
    
    function refund(uint amount) external onlyOwnerOrEmployee {  // terminates the (amount) of unwithdrawn earnings.
        require(amount < earnings);
        earnings -= amount;

        emit Refunded(amount, msg.sender, now);
    }

    function clientWithdraw() external onlyOwner { // withdraws all funds minus locked in earnings.
        require(address(this).balance > earnings);
        uint amount = address(this).balance - earnings;
        
        owner.transfer(amount);
        
        emit ClientWithdrawal(amount, now);
    }
    
    function clientWithdraw(uint amount) external onlyOwner { // withdraws (amount), if not locked in earnings.
        require(address(this).balance > earnings);
        require(amount < address(this).balance);
        require(address(this).balance - amount > earnings);
        
        owner.transfer(amount);

        emit ClientWithdrawal(amount, now);
    }


}
