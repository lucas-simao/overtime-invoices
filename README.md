# Overtime invoice

A local page for a monthly contractor invoice. You fill in a profile, paste the month's overtime notes, and get three things:

- an invoice PDF
- an overtime breakdown PDF
- the email that sends them

## What it makes

These are the files for the fictional company in [`examples/`](examples): Northwind Studio billing Example Client for October 2026, with three days of overtime.

![Invoice and overtime breakdown generated from the example month](docs/documents.png)

Open the real files: [invoice PDF](docs/example-invoice.pdf) · [overtime breakdown PDF](docs/example-overtime-breakdown.pdf)

<details>
<summary>And the email that sends them</summary>

```text
Dear Jordan,

I hope you're doing well.

Please find attached Invoice #20261101 for October 2026, along with the Overtime Breakdown document detailing all overtime hours and the corresponding tasks completed during the month.

Invoice Summary
Base salary: $7,920.00
Overtime: $253.13 (4:30 hours)
Total invoice amount: $8,173.00

If you have any questions or need any additional information, please don't hesitate to reach out.

Thank you for your time and support.

Best regards,

Alex Rivera
Northwind Studio
```

</details>

To make these yourself, run `npm run generate -- --profile examples/sample-profile.json --input examples/sample-month.txt --year 2026 --out ./out`.

## Your data stays here

Nothing is uploaded. The profile and the notes stay in this browser. A finished profile is kept in a list there: next month, pick it and change the notes. Downloading the files saves a profile that is not in the list yet, and you can delete one you no longer need. You can export the profile as JSON and import it on another computer.

## Run it

```bash
npm install
npm test
npm run dev
```

Open the address Vite prints. Load the example to see a fictional month, then replace it with your own company, client, rate, and notes.

The same generator can write the files from the command line:

```bash
npm run generate -- --profile profile.json --input month.txt --year 2026 --out ./out
```

`profile.json` is the file you export from the page. `month.txt` is the pasted notes. The year is required because the notes only carry the day and the month.

## Notes format

Each day is one Slack-style line:

```text
Horas Extras dia 01/10 - Total 1:30 SOFT 100 101
```

An uppercase project code applies to the bare numbers that follow it, until another project code appears. `SOFT 100` becomes `SOFT-100`. `PLA-400` stays as it is. Words stay as a description, in the order you wrote them. A parenthetical stays on the item before it: `PLA 500 (Sample note)`. A code repeated on the same day is kept once. Names, timestamps, `(edited)`, and `Sent using @…` are ignored.

## How the total is calculated

Weekdays in the month are the business days. Holidays that fall on a weekday still count.

- Base salary = business days × hours in a day × hourly rate
- Overtime rate = hourly rate × (1 + overtime percent)
- Overtime pay is rounded to the nearest cent
- The invoice total drops the remaining cents, so the amount is a whole dollar and the words end in "zero cents"

At $45 an hour and 25% overtime, the example month is the check: 4:30 of overtime is $253.13, the base salary is $7,920.00, and the invoice is $8,173.00.

The PDFs follow the letter shown on the page: the same layout, colors and type hierarchy. The invoice is US Letter and the breakdown is A4. They use Times and Helvetica, the fonts built into every PDF reader, in place of the page's IBM Plex Serif and Sans, so the project ships no font files.

The page does not create a tax receipt (NFS-e).
