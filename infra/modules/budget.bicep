// Monthly cost Budget on the resource group (ticket 08). It only alerts: it cannot
// stop spending. The kill switch (translationsEnabled) and the quotas do that.

@description('Budget name, unique within the resource group.')
param name string

@description('Monthly amount, in the billing currency.')
@minValue(1)
param amount int

@description('Who gets the alerts.')
@minLength(1)
param contactEmails array

@description('First day of a month. A past start date must be in the current month, so it defaults to this month.')
param startDate string = '${utcNow('yyyy-MM')}-01T00:00:00Z'

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = {
  name: name
  properties: {
    category: 'Cost'
    amount: amount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: startDate
    }
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        thresholdType: 'Actual'
        threshold: 50
        contactEmails: contactEmails
      }
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        thresholdType: 'Actual'
        threshold: 80
        contactEmails: contactEmails
      }
      actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        thresholdType: 'Actual'
        threshold: 100
        contactEmails: contactEmails
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        thresholdType: 'Forecasted'
        threshold: 100
        contactEmails: contactEmails
      }
    }
  }
}
