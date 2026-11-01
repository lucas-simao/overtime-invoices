import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react"
import {
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"

import sampleProfile from "../examples/sample-profile.json"
import sampleMonth from "../examples/sample-month.txt?raw"
import { calculate } from "@/core/calculate"
import { MONTHS, previousMonth } from "@/core/dates"
import {
  breakdownFileName,
  buildEmail,
  invoiceFileName,
  invoiceIssueDate,
} from "@/core/documents"
import {
  formatDuration,
  formatMoney,
  invoiceAmountWords,
} from "@/core/money"
import { assessMonth, parseOvertime } from "@/core/parse"
import { isProfile, profileErrors } from "@/core/profile"
import {
  deleteProfile,
  emptyLibrary,
  parseLibrary,
  profileIdentity,
  profileSummary,
  upsertProfile,
  type ProfileLibrary,
  type SavedProfile,
} from "@/core/profile-library"
import type { Calculation, Profile } from "@/core/types"
import { renderBreakdown } from "@/pdf/breakdown"
import { renderInvoice } from "@/pdf/invoice"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const STORAGE_KEY = "overtime-invoice.v1"
const LIBRARY_KEY = "overtime-invoice.profiles.v1"
const YEAR_MESSAGE = "Enter a year between 2000 and 2100."

const MONTH_ITEMS = MONTHS.map((label, index) => ({
  label,
  value: String(index + 1),
}))

type FormState = {
  legalName: string
  address: string
  signName: string
  shortName: string
  billName: string
  billAddress: string
  serviceDescription: string
  hourlyRate: string
  overtimePercent: string
  hoursPerDay: string
  recipientName: string
  year: string
  month: string
  notes: string
}

type Draft = {
  profile: Profile
  year: number
  month: number
  notes: string
}

type Notice = {
  title: string
  message: string
}

function linesOf(value: string): string[] {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function emptyForm(period: { year: number; month: number }): FormState {
  return {
    legalName: "",
    address: "",
    signName: "",
    shortName: "",
    billName: "",
    billAddress: "",
    serviceDescription: "",
    hourlyRate: "",
    overtimePercent: "",
    hoursPerDay: "",
    recipientName: "",
    year: String(period.year),
    month: String(period.month),
    notes: "",
  }
}

function toProfile(form: FormState): Profile {
  return {
    issuer: {
      legalName: form.legalName,
      addressLines: linesOf(form.address),
      signName: form.signName,
      shortName: form.shortName,
    },
    billTo: {
      name: form.billName,
      addressLines: linesOf(form.billAddress),
    },
    serviceDescription: form.serviceDescription,
    hourlyRate: Number(form.hourlyRate),
    overtimePercent: Number(form.overtimePercent),
    hoursPerBusinessDay: Number(form.hoursPerDay),
    recipientName: form.recipientName,
  }
}

function toDraft(form: FormState): Draft {
  return {
    profile: toProfile(form),
    year: Number(form.year),
    month: Number(form.month),
    notes: form.notes,
  }
}

function fromDraft(draft: Draft): FormState {
  return {
    legalName: draft.profile.issuer.legalName,
    address: draft.profile.issuer.addressLines.join("\n"),
    signName: draft.profile.issuer.signName,
    shortName: draft.profile.issuer.shortName,
    billName: draft.profile.billTo.name,
    billAddress: draft.profile.billTo.addressLines.join("\n"),
    serviceDescription: draft.profile.serviceDescription,
    hourlyRate: String(draft.profile.hourlyRate),
    overtimePercent: String(draft.profile.overtimePercent),
    hoursPerDay: String(draft.profile.hoursPerBusinessDay),
    recipientName: draft.profile.recipientName,
    year: String(draft.year),
    month: String(draft.month),
    notes: draft.notes,
  }
}

function isBlank(form: FormState): boolean {
  return (
    !form.notes.trim() &&
    !form.legalName.trim() &&
    !form.signName.trim() &&
    !form.billName.trim() &&
    !form.hourlyRate.trim() &&
    !form.overtimePercent.trim()
  )
}

function persist(draft: Draft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Private mode and full storage still leave the page usable.
  }
}

function loadLibrary(): ProfileLibrary {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return emptyLibrary()
    return parseLibrary(JSON.parse(raw))
  } catch {
    return emptyLibrary()
  }
}

function persistLibrary(library: ProfileLibrary) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  } catch {
    // Private mode and full storage still leave the page usable.
  }
}

function restore(): Draft | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved) as Partial<Draft>
    if (
      !isProfile(parsed.profile) ||
      typeof parsed.year !== "number" ||
      typeof parsed.month !== "number"
    ) {
      return null
    }
    return {
      profile: parsed.profile,
      year: parsed.year,
      month: parsed.month,
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    }
  } catch {
    return null
  }
}

function initialForm(): FormState {
  const saved = restore()
  if (saved) return fromDraft(saved)
  return emptyForm(previousMonth())
}

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function TextControl({
  id,
  label,
  value,
  onChange,
  error,
  errors,
  hint,
  multiline = false,
  inputMode,
  spellCheck,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  errors?: string[]
  hint?: string
  multiline?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
  spellCheck?: boolean
  className?: string
}) {
  const invalid = Boolean(error) || Boolean(errors?.length)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          spellCheck={spellCheck}
          autoComplete="off"
          className={className}
        />
      ) : (
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          inputMode={inputMode}
          autoComplete="off"
        />
      )}
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {errors && errors.length > 0 ? (
        <FieldError errors={errors.map((message) => ({ message }))} />
      ) : null}
    </Field>
  )
}

export function App() {
  const [form, setForm] = useState(initialForm)
  const [library, setLibrary] = useState(loadLibrary)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)
  const blank = isBlank(form)
  const profile = useMemo(() => toProfile(form), [form])
  const year = Number(form.year)
  const month = Number(form.month)
  const parsed = useMemo(() => parseOvertime(form.notes), [form.notes])
  const yearInvalid = !Number.isInteger(year) || year < 2000 || year > 2100
  const monthInvalid = !Number.isInteger(month) || month < 1 || month > 12
  const monthFitErrors =
    Number.isInteger(year) && month >= 1 && month <= 12
      ? assessMonth(parsed.entries, year, month)
      : []
  const noteErrors = [...parsed.errors, ...monthFitErrors]
  const profileProblems = profileErrors(profile)
  const errors = [
    ...profileProblems,
    ...(yearInvalid ? [YEAR_MESSAGE] : []),
    ...(monthInvalid ? ["Choose the month that was worked."] : []),
    ...noteErrors,
  ]
  const ready = !blank && errors.length === 0 && parsed.entries.length > 0
  const calc = useMemo(() => {
    if (!ready) return null
    return calculate({
      year,
      month,
      hourlyRate: profile.hourlyRate,
      overtimePercent: profile.overtimePercent,
      hoursPerBusinessDay: profile.hoursPerBusinessDay,
      days: parsed.entries,
    })
  }, [ready, year, month, profile, parsed.entries])
  const email = calc ? buildEmail(profile, calc) : ""

  useEffect(() => {
    if (blank) return
    persist(toDraft(form))
  }, [blank, form])

  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    if (profileProblems.length > 0) return
    const identity = profileIdentity(profile)
    setLibrary((current) => {
      if (current.dismissed.includes(identity)) return current
      if (current.profiles.some((item) => profileIdentity(item.profile) === identity)) return current
      const next = upsertProfile(current, profile)
      persistLibrary(next)
      return next
    })
  }, [profile, profileProblems.length])

  useEffect(() => {
    if (profileProblems.length > 0) return
    const identity = profileIdentity(profile)
    const timer = window.setTimeout(() => {
      setLibrary((current) => {
        const match = current.profiles.find((item) => profileIdentity(item.profile) === identity)
        if (!match || current.dismissed.includes(identity)) return current
        if (JSON.stringify(match.profile) === JSON.stringify(profile)) return current
        const next = upsertProfile(current, profile)
        persistLibrary(next)
        return next
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [profile, profileProblems.length])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  function problem(message: string): string | undefined {
    if (blank) return undefined
    return profileProblems.includes(message) ? message : undefined
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setNotice(null)
    setCopied(false)
    setForm((current) => ({ ...current, [key]: value }))
  }

  function loadExample() {
    if (!isProfile(sampleProfile)) return
    setNotice(null)
    setCopied(false)
    setForm(
      fromDraft({
        profile: sampleProfile,
        year: 2026,
        month: 10,
        notes: sampleMonth.trim(),
      }),
    )
  }

  function exportProfile() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "overtime-profile.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  async function onImport(file: File) {
    try {
      const parsedFile = JSON.parse(await file.text()) as unknown
      if (!isProfile(parsedFile)) {
        setNotice({
          title: "Could not import",
          message: "This file is not a profile.",
        })
        return
      }
      setNotice(null)
      setCopied(false)
      setForm((current) =>
        fromDraft({ ...toDraft(current), profile: parsedFile }),
      )
      remember(parsedFile)
    } catch {
      setNotice({
        title: "Could not import",
        message: "This file is not a profile.",
      })
    }
  }

  async function savePdf(kind: "invoice" | "breakdown", current: Calculation) {
    try {
      const bytes =
        kind === "invoice"
          ? await renderInvoice(profile, current)
          : await renderBreakdown(profile, current)
      download(
        bytes,
        kind === "invoice"
          ? invoiceFileName(current)
          : breakdownFileName(current),
      )
      remember(profile)
    } catch {
      setNotice({
        title: "Could not create the PDF",
        message: "The file did not download. Try again.",
      })
    }
  }

  async function copyEmail() {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
    } catch {
      const area = document.createElement("textarea")
      area.value = email
      area.style.position = "fixed"
      area.style.left = "-9999px"
      document.body.appendChild(area)
      area.select()
      document.execCommand("copy")
      area.remove()
    }
    setCopied(true)
  }

  const notesInvalid = !blank && noteErrors.length > 0
  const currentIdentity = profileIdentity(profile)
  const profileReady = profileProblems.length === 0
  const savedMatch = library.profiles.some(
    (item) => profileIdentity(item.profile) === currentIdentity,
  )
  const showPendingSave = profileReady && !savedMatch && library.profiles.length > 0

  function remember(nextProfile: Profile) {
    if (profileErrors(nextProfile).length > 0) return
    setLibrary((current) => {
      const next = upsertProfile(current, nextProfile)
      persistLibrary(next)
      return next
    })
  }

  function applySaved(saved: SavedProfile) {
    setNotice(null)
    setCopied(false)
    setForm((current) => fromDraft({ ...toDraft(current), profile: saved.profile }))
  }

  function removeSaved(id: string) {
    setLibrary((current) => {
      const next = deleteProfile(current, id)
      persistLibrary(next)
      return next
    })
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="font-heading text-2xl">Overtime invoice</h1>
        <p className="text-sm text-muted-foreground">
          Prepare the invoice, the overtime breakdown, and the email. The
          numbers stay in this browser.
        </p>
      </header>
      <Separator />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              These fields print on the invoice and open the email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="profile-form"
              autoComplete="off"
              onSubmit={(event) => event.preventDefault()}
            >
              <FieldGroup>
                <FieldSet className="w-full min-w-0">
                  <FieldLegend>Saved profiles</FieldLegend>
                  <FieldDescription>
                    {library.profiles.length === 0
                      ? "A profile is saved on this computer when you download the invoice or the breakdown."
                      : "Pick one to fill the company, the client, and the rate. The month and the notes stay as they are."}
                  </FieldDescription>
                  {library.profiles.length > 0 ? (
                    <SavedProfileList
                      profiles={library.profiles}
                      activeIdentity={profileReady ? currentIdentity : ""}
                      onApply={applySaved}
                      onDelete={removeSaved}
                    />
                  ) : null}
                  {showPendingSave ? (
                    <FieldDescription>
                      This version is saved when you download the files.
                    </FieldDescription>
                  ) : null}
                </FieldSet>
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend>Your company</FieldLegend>
                  <FieldDescription>
                    Printed on the invoice and under the signature.
                  </FieldDescription>
                  <FieldGroup>
                    <TextControl
                      id="legalName"
                      label="Legal name"
                      value={form.legalName}
                      onChange={(value) => setField("legalName", value)}
                      error={problem("Enter the legal name on the invoice.")}
                    />
                    <TextControl
                      id="address"
                      label="Address"
                      value={form.address}
                      onChange={(value) => setField("address", value)}
                      hint="One line for each row on the invoice."
                      multiline
                      className="field-sizing-fixed min-h-28 resize-none"
                    />
                    <TextControl
                      id="signName"
                      label="Name under the signature"
                      value={form.signName}
                      onChange={(value) => setField("signName", value)}
                      error={problem("Enter the name under the signature.")}
                    />
                    <TextControl
                      id="shortName"
                      label="Short name in the email"
                      value={form.shortName}
                      onChange={(value) => setField("shortName", value)}
                      error={problem(
                        "Enter the short company name used in the email.",
                      )}
                    />
                  </FieldGroup>
                </FieldSet>
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend>Client</FieldLegend>
                  <FieldDescription>
                    Who the invoice is billed to.
                  </FieldDescription>
                  <FieldGroup>
                    <TextControl
                      id="billName"
                      label="Name"
                      value={form.billName}
                      onChange={(value) => setField("billName", value)}
                      error={problem("Enter the client name.")}
                    />
                    <TextControl
                      id="billAddress"
                      label="Address"
                      value={form.billAddress}
                      onChange={(value) => setField("billAddress", value)}
                      multiline
                      className="field-sizing-fixed min-h-16 resize-none"
                    />
                    <TextControl
                      id="serviceDescription"
                      label="Service on the invoice"
                      value={form.serviceDescription}
                      onChange={(value) =>
                        setField("serviceDescription", value)
                      }
                      error={problem("Enter the service description.")}
                    />
                    <TextControl
                      id="recipientName"
                      label="Email greeting"
                      value={form.recipientName}
                      onChange={(value) => setField("recipientName", value)}
                      hint="The email opens with “Dear” and this name."
                      error={problem("Enter the name the email opens with.")}
                    />
                  </FieldGroup>
                </FieldSet>
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend>Rates</FieldLegend>
                  <FieldGroup>
                    <TextControl
                      id="hourlyRate"
                      label="Hourly rate (USD)"
                      value={form.hourlyRate}
                      onChange={(value) => setField("hourlyRate", value)}
                      inputMode="decimal"
                      error={problem("Enter an hourly rate above zero.")}
                    />
                    <TextControl
                      id="overtimePercent"
                      label="Overtime percent"
                      value={form.overtimePercent}
                      onChange={(value) => setField("overtimePercent", value)}
                      inputMode="decimal"
                      error={problem("Overtime percent cannot be negative.")}
                    />
                    <TextControl
                      id="hoursPerDay"
                      label="Hours in a business day"
                      value={form.hoursPerDay}
                      onChange={(value) => setField("hoursPerDay", value)}
                      inputMode="decimal"
                      error={problem("Enter the hours in a business day.")}
                    />
                  </FieldGroup>
                </FieldSet>
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend>This month</FieldLegend>
                  <FieldDescription>
                    The month the hours were worked. The invoice is dated the
                    1st of the next month.
                  </FieldDescription>
                  <FieldGroup>
                    <Field data-invalid={(!blank && monthInvalid) || undefined}>
                      <FieldLabel htmlFor="month">Month worked</FieldLabel>
                      <Select
                        items={MONTH_ITEMS}
                        value={form.month}
                        onValueChange={(value) => {
                          if (value) setField("month", value)
                        }}
                      >
                        <SelectTrigger
                          id="month"
                          className="w-full"
                          aria-invalid={(!blank && monthInvalid) || undefined}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start">
                          <SelectGroup>
                            {MONTH_ITEMS.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {!blank && monthInvalid ? (
                        <FieldError>
                          Choose the month that was worked.
                        </FieldError>
                      ) : null}
                    </Field>
                    <TextControl
                      id="year"
                      label="Year"
                      value={form.year}
                      onChange={(value) => setField("year", value)}
                      inputMode="numeric"
                      error={!blank && yearInvalid ? YEAR_MESSAGE : undefined}
                    />
                    <TextControl
                      id="notes"
                      label="Overtime notes"
                      value={form.notes}
                      onChange={(value) => setField("notes", value)}
                      hint="Paste the Slack notes. An uppercase project code such as SOFT or PLA applies to the numbers that follow."
                      multiline
                      spellCheck={false}
                      className="field-sizing-fixed max-h-80 min-h-48 resize-none overflow-y-auto"
                      errors={notesInvalid ? noteErrors : undefined}
                    />
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={loadExample}>
              Load example
            </Button>
            <Button type="button" variant="outline" onClick={exportProfile}>
              Export profile
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              Import profile
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void onImport(file)
              }}
            />
          </CardFooter>
        </Card>
        <div
          className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6"
          aria-live="polite"
        >
          {notice ? (
            <Alert variant="destructive">
              <WarningCircleIcon />
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription>{notice.message}</AlertDescription>
            </Alert>
          ) : null}
          {calc ? (
            <Letter
              calc={calc}
              email={email}
              copied={copied}
              onCopy={() => void copyEmail()}
              onInvoice={() => void savePdf("invoice", calc)}
              onBreakdown={() => void savePdf("breakdown", calc)}
            />
          ) : (
            <Card>
              <CardContent>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileTextIcon />
                    </EmptyMedia>
                    <EmptyTitle>
                      {blank ? "Nothing to invoice yet" : "The letter is waiting"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {blank
                        ? "Add your company, your rate, and a month of notes. The total, the email, and the files show up here."
                        : "Fix the highlighted fields. The total and the email show up once the month lines up."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          )}
          {parsed.entries.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Parsed days</CardTitle>
                <CardDescription>
                  {parsed.entries.length === 1
                    ? "1 day read from the notes."
                    : `${parsed.entries.length} days read from the notes.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Tasks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.entries.map((entry, index) => (
                      <TableRow key={`${entry.month}-${entry.day}-${index}`}>
                        <TableCell>
                          {MONTHS[entry.month - 1]}{" "}
                          {String(entry.day).padStart(2, "0")}
                        </TableCell>
                        <TableCell>
                          {formatDuration(entry.totalMinutes)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {entry.tasks.length
                            ? entry.tasks.join(", ")
                            : "No tasks"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Letter({
  calc,
  email,
  copied,
  onCopy,
  onInvoice,
  onBreakdown,
}: {
  calc: Calculation
  email: string
  copied: boolean
  onCopy: () => void
  onInvoice: () => void
  onBreakdown: () => void
}) {
  const overtimeRate = formatMoney(calc.overtimeRateCents)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice {calc.invoiceId}</CardTitle>
        <CardDescription>{invoiceIssueDate(calc)}</CardDescription>
        <CardAction>
          <Badge variant="outline">
            {MONTHS[calc.month - 1]} {calc.year}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-heading text-2xl">{formatMoney(calc.invoiceCents)}</p>
          <p className="text-muted-foreground">{invoiceAmountWords(calc.invoiceCents)}</p>
        </div>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell className="whitespace-normal">Base salary</TableCell>
              <TableCell className="text-right">
                {formatMoney(calc.baseCents)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="whitespace-normal">
                Overtime {formatDuration(calc.overtimeMinutes)} at {overtimeRate}
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(calc.overtimeCents)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="whitespace-normal">
                {calc.days.length} days in {MONTHS[calc.month - 1]} {calc.year}
              </TableCell>
              <TableCell className="text-right">
                {formatDuration(calc.overtimeMinutes)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Separator />
        <div className="flex flex-col gap-2">
          <p className="font-medium">Email</p>
          <pre className="whitespace-pre-wrap break-words">{email}</pre>
        </div>
        <p className="text-muted-foreground">
          {invoiceFileName(calc)}
          <br />
          {breakdownFileName(calc)}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button type="button" onClick={onInvoice}>
          <DownloadSimpleIcon data-icon="inline-start" />
          Download invoice
        </Button>
        <Button type="button" variant="outline" onClick={onBreakdown}>
          <DownloadSimpleIcon data-icon="inline-start" />
          Download breakdown
        </Button>
        <Button type="button" variant="outline" onClick={onCopy}>
          {copied ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy email"}
        </Button>
      </CardFooter>
    </Card>
  )
}

function SavedProfileList({
  profiles,
  activeIdentity,
  onApply,
  onDelete,
}: {
  profiles: SavedProfile[]
  activeIdentity: string
  onApply: (saved: SavedProfile) => void
  onDelete: (id: string) => void
}) {
  const rows = profiles.map((saved) => {
    const summary = profileSummary(saved.profile)
    const active = profileIdentity(saved.profile) === activeIdentity
    return (
      <div key={saved.id} className="flex w-full min-w-0 items-center gap-2">
        <Button
          type="button"
          variant={active ? "secondary" : "outline"}
          aria-pressed={active}
          title={summary}
          className="min-w-0 flex-1 shrink justify-start overflow-hidden"
          onClick={() => onApply(saved)}
        >
          <span className="min-w-0 truncate">{summary}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete ${summary}`}
          onClick={() => onDelete(saved.id)}
        >
          <TrashIcon />
        </Button>
      </div>
    )
  })

  if (profiles.length <= 4) {
    return <div className="flex flex-col gap-2">{rows}</div>
  }

  return (
    <ScrollArea className="h-48">
      <div className="flex flex-col gap-2 pr-3">{rows}</div>
    </ScrollArea>
  )
}
