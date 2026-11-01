# Overtime invoice

A local page for a monthly contractor invoice. You fill in a profile, paste the month's overtime notes, and get three things:

- an invoice PDF
- an overtime breakdown PDF
- the email that sends them

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

The invoice is US Letter. The breakdown is A4. Both use Helvetica, which is built into the PDF, so the project does not ship a paid font.

The page does not create a tax receipt (NFS-e).
