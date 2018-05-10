# HourlyPay - Ethereum Solidity Contract for Hourly Wage payments

The Hourly Pay Contract allows you to track your time and get paid a hourly wage for tracked time.

 HOW IT WORKS:

  1. Client creates the contract, making himself the owner of the contract.

  2. Client can fund the contract with ETH by simply sending money to the contract (via payable fallback function).

  3. Before hiring someone, client can change additional parameters, such as:

      - setContractDurationInDays(days) - The duration of the contract (default is 365 days).

      - setDailyHourLimit(hours) - How much hours the Employee can work per day (default is 8 hours).

      - setPaydayFrequencyInDays(days) - How often the Employee can withdraw the earnings (default is every 3 days).

      - setBeginTimeTS(utcTimestamp) - Work on contract can be started after this timestamp (default is contract creation time).
                                       Also defines the start of Day and Week for accounting and daily limits.
                                       Day transition time should be convenient for the employee (like 4am),
                                       so that work doesn't cross between days,
                                       The excess won't be transferred to the next day.

  4. Client hires the Employee by invoking hire(addressOfEmployee, ratePerHourInWei)
     This starts the project and puts the contract in a workable state.
     Before hiring, contract should be loaded with enough ETH to provide at least one day of work at specified ratePerHourInWei
 
  5. To start work and earn ETH the Employee should:

      - invoke startWork() when he starts working to run the timer.

      - invoke stopWork() when he finishes working to stop the timer.

      After the timer is stopped - the ETH earnings are calculated and recorded on Employee's internal balance.
      If the stopWork() is invoked after more hours had passed than dailyLimit - the excess is ignored and only the dailyLimit is added to the internal balance.

  6. Employee can withdraw earnings from internal balance after paydayFrequencyInDays days have passed after BeginTimeTS:
      - by invoking withdraw()

      After each withdrawal the paydayFrequencyInDays is reset and starts counting itself from the TS of the first startWork() after withdrawal.

      This delay is implemented as a safety mechanism, so the Client can have time to check the work and cancel the earnings if something goes wrong.
      That way only money earned during the last paydayFrequencyInDays is at risk.

  7. Client can fire() the Employee after his services are no longer needed.
    That would stop any ongoing work by terminating the timer and won't allow to start the work again.

  8. If anything in the relationship or hour counting goes wrong, there are safety functions:
      - refundAll() - terminates all unwithdrawn earnings.
      - refund(amount) - terminates the (amount) of unwithdrawn earnings.
    Can be only called if not working.
    Both of these can be called by Client or Employee.
      * TODO: Still need to think if allowing Client to do that won't hurt the Employee.
      * TODO: SecondsWorkedToday don't reset after refund, so dailyLimit still affects
      * TODO: Think of a better name. ClearEarnings?

  9. Client can withdraw any excess ETH from the contract via:
      - clientWithdrawAll() - withdraws all funds minus locked in earnings.
      - clientWithdraw(amount) - withdraws (amount), not locked in earnings.
    Can be invoked only if Employee isn't hired or has been fired.
