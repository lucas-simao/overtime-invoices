import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import {
  ArrowDownIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  ImageSquareIcon,
  LockSimpleIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { cn } from "cn"
import { fileToLogo, LOGO_ACCEPT, LogoError } from "@/lib/logo"

import sampleProfile from "../examples/sample-profile.json"
import sampleMonth from "../examples/sample-month.txt?raw"
import { calculate } from "@/core/calculate"
import {
  countBusinessDays,
  DAY_NAMES,
  DAY_NAMES_SHORT,
  invoiceIdentity,
  invoiceNumberError,
  MONTHS,
  normalizeWorkDays,
  parseIsoDate,
  previousMonth,
  toIsoDate,
  today,
  WEEKDAYS,
} from "@/core/dates"
import {
  breakdownFileName,
  buildEmail,
  invoiceFileName,
  invoiceIssueDate,
  overtimeDaysLabel,
} from "@/core/documents"
import {
  dollarsToCents,
  formatDuration,
  formatMoney,
  formatPercent,
  invoiceAmountWords,
} from "@/core/money"
import { assessMonth, type DateOrder, parseOvertime } from "@/core/parse"
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
import type { Calculation, DayEntry, Profile } from "@/core/types"
import { renderBreakdown } from "@/pdf/breakdown"
import { renderInvoice } from "@/pdf/invoice"
import { Button } from "@/components/ui/button"
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
const DATE_MESSAGE = "Enter the invoice date."

const MONTH_ITEMS = MONTHS.map((label, index) => ({
  label,
  value: String(index + 1),
}))

type FormState = {
  legalName: string
  /** PNG data URL, or "" for none. */
  logo: string
  address: string
  signName: string
  shortName: string
  billName: string
  /** PNG data URL, or "" for none. */
  billLogo: string
  billAddress: string
  serviceDescription: string
  hourlyRate: string
  overtimePercent: string
  hoursPerDay: string
  /** Weekdays paid in the base salary, 0 = Sunday. */
  workDays: number[]
  recipientName: string
  year: string
  month: string
  notes: string
  /** YYYY-MM-DD typed by the person. Empty means today. Not saved between visits. */
  invoiceDate: string
  /** Empty means the usual number for the month (20261101 for October 2026). Not saved between visits. */
  invoiceNumber: string
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
    logo: "",
    address: "",
    signName: "",
    shortName: "",
    billName: "",
    billLogo: "",
    billAddress: "",
    serviceDescription: "",
    hourlyRate: "",
    overtimePercent: "",
    hoursPerDay: "",
    workDays: [...WEEKDAYS],
    recipientName: "",
    year: String(period.year),
    month: String(period.month),
    notes: "",
    invoiceDate: "",
    invoiceNumber: "",
  }
}

function toProfile(form: FormState): Profile {
  return {
    issuer: {
      legalName: form.legalName,
      addressLines: linesOf(form.address),
      signName: form.signName,
      shortName: form.shortName,
      ...(form.logo ? { logo: form.logo } : {}),
    },
    billTo: {
      name: form.billName,
      addressLines: linesOf(form.billAddress),
      ...(form.billLogo ? { logo: form.billLogo } : {}),
    },
    serviceDescription: form.serviceDescription,
    hourlyRate: Number(form.hourlyRate),
    overtimePercent: Number(form.overtimePercent),
    hoursPerBusinessDay: Number(form.hoursPerDay),
    workDays: form.workDays,
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
    logo: draft.profile.issuer.logo ?? "",
    address: draft.profile.issuer.addressLines.join("\n"),
    signName: draft.profile.issuer.signName,
    shortName: draft.profile.issuer.shortName,
    billName: draft.profile.billTo.name,
    billLogo: draft.profile.billTo.logo ?? "",
    billAddress: draft.profile.billTo.addressLines.join("\n"),
    serviceDescription: draft.profile.serviceDescription,
    hourlyRate: String(draft.profile.hourlyRate),
    overtimePercent: String(draft.profile.overtimePercent),
    hoursPerDay: String(draft.profile.hoursPerBusinessDay),
    workDays: normalizeWorkDays(draft.profile.workDays),
    recipientName: draft.profile.recipientName,
    year: String(draft.year),
    month: String(draft.month),
    notes: draft.notes,
    invoiceDate: "",
    invoiceNumber: "",
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

/** Which weekdays the base salary pays. Weeks start on Monday. */
function WorkDaysControl({
  value,
  onChange,
  error,
  count,
}: {
  value: number[]
  onChange: (value: number[]) => void
  error?: string
  count?: { days: number; period: string }
}) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  function toggle(day: number) {
    onChange(
      value.includes(day)
        ? value.filter((item) => item !== day)
        : normalizeWorkDays([...value, day]),
    )
  }
  return (
    <Field data-invalid={error ? true : undefined} className="mt-4">
      <FieldLabel id="workDays-label">Work days</FieldLabel>
      <div role="group" aria-labelledby="workDays-label" className="flex flex-wrap gap-1.5">
        {order.map((day) => {
          const on = value.includes(day)
          return (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              aria-pressed={on}
              aria-label={DAY_NAMES[day]}
              className="w-12"
              onClick={() => toggle(day)}
            >
              {DAY_NAMES_SHORT[day]}
            </Button>
          )
        })}
      </div>
      <FieldDescription>
        {count && value.length > 0
          ? `${count.period} has ${count.days} of these days; the base salary pays them. `
          : "The base salary pays these days in the month. "}
        Overtime, holidays included, comes only from the notes.
      </FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

/** Pick, preview and remove a logo. The file never leaves the browser. */
function LogoControl({
  id,
  label,
  value,
  onChange,
  onError,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToLogo(file))
    } catch (error) {
      onError(error instanceof LogoError ? error.message : "The image could not be read. Try a PNG or JPEG.")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-[#FBFBFC] px-2">
          {value ? (
            <img src={value} alt={`${label} preview`} className="max-h-11 max-w-full object-contain" />
          ) : (
            <ImageSquareIcon aria-hidden className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {value ? "Replace" : "Add logo"}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              Remove
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
      </div>
      <FieldDescription>PNG, JPEG, SVG or WebP. Printed on the invoice; saved with the profile.</FieldDescription>
    </Field>
  )
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
  mono = false,
  type,
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
  mono?: boolean
  type?: "text" | "date"
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
          type={type}
          autoComplete="off"
          className={cn(mono && "font-mono", className)}
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
  const parsed = useMemo(
    () => parseOvertime(form.notes, { preferMonth: Number(form.month) || undefined }),
    [form.notes, form.month],
  )
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
  const todayIso = toIsoDate(today())
  const defaultNumber =
    !yearInvalid && !monthInvalid ? invoiceIdentity(year, month).id : ""
  const invoiceDate = form.invoiceDate || todayIso
  const invoiceNumber = form.invoiceNumber || defaultNumber
  const issueDate = parseIsoDate(invoiceDate)
  const dateError = issueDate ? undefined : DATE_MESSAGE
  const numberError = defaultNumber ? invoiceNumberError(invoiceNumber) : undefined
  if (dateError) errors.push(dateError)
  if (numberError) errors.push(numberError)
  const ready = !blank && errors.length === 0 && parsed.entries.length > 0
  const calc = useMemo(() => {
    if (!ready) return null
    return calculate({
      year,
      month,
      hourlyRate: profile.hourlyRate,
      overtimePercent: profile.overtimePercent,
      hoursPerBusinessDay: profile.hoursPerBusinessDay,
      workDays: profile.workDays,
      days: parsed.entries,
      issueDate: issueDate ?? undefined,
      invoiceNumber,
    })
  }, [ready, year, month, profile, parsed.entries, issueDate?.year, issueDate?.month, issueDate?.day, invoiceNumber])
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
    setForm((current) => ({
      ...current,
      [key]: value,
      // A number typed for one month should not follow the form to another.
      ...(key === "month" || key === "year" ? { invoiceNumber: "" } : {}),
    }))
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
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-4 px-4 pt-6 pb-5 md:px-10 md:pt-7 md:pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Overtime invoice
          </h1>
          <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <LockSimpleIcon aria-hidden className="size-3.5" />
            Runs in this browser. Nothing is sent to a server.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={loadExample}
            className={blank ? "font-semibold text-primary" : undefined}
          >
            Load example
          </Button>
          <Button type="button" variant="ghost" onClick={exportProfile}>
            Export profile
          </Button>
          <Button
            type="button"
            variant="ghost"
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
        </div>
        {calc ? (
          <a
            href="#letter"
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[10px] bg-foreground px-4 py-3 text-background lg:hidden"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-background/75">
                Invoice {calc.invoiceId} · ready
              </span>
              <span className="font-serif text-[1.375rem] font-medium">
                {formatMoney(calc.invoiceCents)}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              See letter
              <ArrowDownIcon aria-hidden className="size-4" />
            </span>
          </a>
        ) : null}
      </header>

      <main className="mx-auto grid w-full max-w-[1360px] items-start gap-10 px-4 pb-16 md:px-10 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-12">
        <form
          id="profile-form"
          autoComplete="off"
          onSubmit={(event) => event.preventDefault()}
          className="min-w-0"
        >
          <FieldGroup className="gap-7">
            <FieldSet className="w-full min-w-0 gap-3">
              <FieldLegend variant="legend" className="mb-0">
                Saved profiles
              </FieldLegend>
              {library.profiles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-input p-4 text-[0.8125rem] leading-relaxed text-paper-muted">
                  A profile is saved on this computer when you download the
                  invoice or the breakdown.
                </p>
              ) : (
                <>
                  <FieldDescription>
                    Pick one to fill the company, the client, and the rate. The
                    month and the notes stay as they are.
                  </FieldDescription>
                  <SavedProfileList
                    profiles={library.profiles}
                    activeIdentity={profileReady ? currentIdentity : ""}
                    onApply={applySaved}
                    onDelete={removeSaved}
                  />
                </>
              )}
              {showPendingSave ? (
                <p className="flex items-center gap-1.5 text-[0.8125rem] text-warning">
                  <ClockIcon aria-hidden className="size-3.5" />
                  This version is saved when you download the files.
                </p>
              ) : null}
            </FieldSet>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Your company</FieldLegend>
              <FieldGroup className="gap-4">
                <TextControl
                  id="legalName"
                  label="Legal name"
                  value={form.legalName}
                  onChange={(value) => setField("legalName", value)}
                  error={problem("Enter the legal name on the invoice.")}
                />
                <LogoControl
                  id="logo"
                  label="Logo"
                  value={form.logo}
                  onChange={(value) => setField("logo", value)}
                  onError={(message) => setNotice({ title: "Could not add the logo", message })}
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
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
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
                </div>
              </FieldGroup>
            </FieldSet>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Client</FieldLegend>
              <FieldGroup className="gap-4">
                <TextControl
                  id="billName"
                  label="Name"
                  value={form.billName}
                  onChange={(value) => setField("billName", value)}
                  error={problem("Enter the client name.")}
                />
                <LogoControl
                  id="billLogo"
                  label="Client logo"
                  value={form.billLogo}
                  onChange={(value) => setField("billLogo", value)}
                  onError={(message) => setNotice({ title: "Could not add the logo", message })}
                />
                <TextControl
                  id="billAddress"
                  label="Address"
                  value={form.billAddress}
                  onChange={(value) => setField("billAddress", value)}
                  multiline
                  className="field-sizing-fixed min-h-20 resize-none"
                />
                <TextControl
                  id="serviceDescription"
                  label="Service on the invoice"
                  value={form.serviceDescription}
                  onChange={(value) => setField("serviceDescription", value)}
                  error={problem("Enter the service description.")}
                />
                <TextControl
                  id="recipientName"
                  label="Email greeting"
                  value={form.recipientName}
                  onChange={(value) => setField("recipientName", value)}
                  hint={
                    form.recipientName.trim()
                      ? `The email opens with “Dear ${form.recipientName.trim()},”`
                      : "The email opens with “Dear” and this name."
                  }
                  error={problem("Enter the name the email opens with.")}
                />
              </FieldGroup>
            </FieldSet>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Rates</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-3 sm:gap-3">
                <TextControl
                  id="hourlyRate"
                  label="Hourly rate (USD)"
                  value={form.hourlyRate}
                  onChange={(value) => setField("hourlyRate", value)}
                  inputMode="decimal"
                  mono
                  error={problem("Enter an hourly rate above zero.")}
                />
                <TextControl
                  id="overtimePercent"
                  label="Overtime percent"
                  value={form.overtimePercent}
                  onChange={(value) => setField("overtimePercent", value)}
                  inputMode="decimal"
                  mono
                  error={problem("Overtime percent cannot be negative.")}
                />
                <TextControl
                  id="hoursPerDay"
                  label="Hours per day"
                  value={form.hoursPerDay}
                  onChange={(value) => setField("hoursPerDay", value)}
                  inputMode="decimal"
                  mono
                  error={problem("Enter the hours in a business day.")}
                />
              </div>
              <WorkDaysControl
                value={form.workDays}
                onChange={(value) => setField("workDays", value)}
                error={problem("Pick at least one work day.")}
                count={
                  !yearInvalid && !monthInvalid
                    ? {
                        days: countBusinessDays(year, month, form.workDays),
                        period: `${MONTHS[month - 1]} ${year}`,
                      }
                    : undefined
                }
              />
            </FieldSet>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>This month</FieldLegend>
              <FieldGroup className="gap-4">
                <div className="grid grid-cols-2 gap-3">
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
                      <FieldError>Choose the month that was worked.</FieldError>
                    ) : null}
                  </Field>
                  <TextControl
                    id="year"
                    label="Year"
                    value={form.year}
                    onChange={(value) => setField("year", value)}
                    inputMode="numeric"
                    mono
                    error={!blank && yearInvalid ? YEAR_MESSAGE : undefined}
                  />
                </div>
                <FieldDescription>The month the hours were worked.</FieldDescription>
                <div className="grid grid-cols-2 gap-3">
                  <TextControl
                    id="invoiceDate"
                    label="Invoice date"
                    type="date"
                    value={invoiceDate}
                    onChange={(value) => setField("invoiceDate", value)}
                    mono
                    error={!blank ? dateError : undefined}
                  />
                  <TextControl
                    id="invoiceNumber"
                    label="Invoice number"
                    value={invoiceNumber}
                    onChange={(value) => setField("invoiceNumber", value)}
                    spellCheck={false}
                    mono
                    error={!blank ? numberError : undefined}
                  />
                </div>
                <FieldDescription>
                  The date starts as today and the number as {defaultNumber || "the 1st of the next month"}.
                  Change either one to prepare an invoice now and send it later.
                </FieldDescription>
                <TextControl
                  id="notes"
                  label="Overtime notes"
                  value={form.notes}
                  onChange={(value) => setField("notes", value)}
                  hint="One day per line, in your own format: 01/10 1:30, Oct 1 1h30, 2026-10-01 90min, 01/10 18:00-20:30, or rows pasted from a spreadsheet. An uppercase project code such as SOFT applies to the numbers that follow."
                  multiline
                  spellCheck={false}
                  className="field-sizing-fixed max-h-96 min-h-56 resize-none overflow-y-auto bg-[#FBFBFC] font-mono text-[0.8125rem] leading-relaxed aria-invalid:bg-card aria-invalid:ring-[3px] aria-invalid:ring-destructive-soft"
                  errors={notesInvalid ? noteErrors : undefined}
                />
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
        </form>

        <div className="flex min-w-0 flex-col gap-5" aria-live="polite">
          {calc ? (
            <>
              <FilesBar
                calc={calc}
                onInvoice={() => void savePdf("invoice", calc)}
                onBreakdown={() => void savePdf("breakdown", calc)}
              />
              <Letter profile={profile} calc={calc} />
              <EmailCard
                email={email}
                copied={copied}
                onCopy={() => void copyEmail()}
              />
            </>
          ) : blank ? (
            <div className="flex min-h-[640px] flex-col items-center justify-center gap-3.5 rounded-[4px] border-[1.5px] border-dashed border-[#BFC5CD] bg-white/45 p-12 text-center">
              <FileTextIcon aria-hidden className="size-10 text-[#8A909A]" weight="light" />
              <p className="font-serif text-2xl font-medium">
                Nothing to invoice yet.
              </p>
              <p className="max-w-sm text-[0.9375rem] leading-relaxed text-paper-muted">
                Add your company, your rate, and a month of notes. The total,
                the email, and the files show up here.
              </p>
            </div>
          ) : (
            <WaitingLetter noteErrorCount={notesInvalid ? noteErrors.length : 0} />
          )}
          {parsed.entries.length > 0 ? (
            <DaysRead entries={parsed.entries} dateOrder={parsed.dateOrder} />
          ) : null}
        </div>
      </main>

      {notice ? (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-[0_10px_30px_-8px_rgba(23,25,30,0.4)]"
        >
          <WarningCircleIcon aria-hidden className="size-[18px] shrink-0 text-[#FFB4A8]" />
          <span className="flex-1">
            <span className="sr-only">{notice.title}: </span>
            {notice.message}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="text-background/70 hover:bg-white/10 hover:text-background"
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FilesBar({
  calc,
  onInvoice,
  onBreakdown,
}: {
  calc: Calculation
  onInvoice: () => void
  onBreakdown: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-card p-3 pl-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[0.8125rem] text-muted-foreground">
          Invoice {calc.invoiceId} · 2 files
        </span>
        <span className="font-mono text-[0.8125rem] break-words">
          {invoiceFileName(calc)} · {breakdownFileName(calc)}
        </span>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
        <Button type="button" onClick={onInvoice}>
          <DownloadSimpleIcon data-icon="inline-start" />
          Download invoice
        </Button>
        <Button type="button" variant="outline" onClick={onBreakdown}>
          <DownloadSimpleIcon data-icon="inline-start" />
          Download breakdown
        </Button>
      </div>
    </div>
  )
}

function PaperLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans text-[0.65625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}

/** The letter: the one warm, serif, shadowed object on the page. No controls on it. */
function Letter({ profile, calc }: { profile: Profile; calc: Calculation }) {
  const overtimeRate = formatMoney(calc.overtimeRateCents)
  const period = `${MONTHS[calc.month - 1]} ${calc.year}`
  return (
    <article
      id="letter"
      aria-label={`Invoice ${calc.invoiceId}`}
      className="scroll-mt-6 rounded-[3px] border border-[#DCDFE3] bg-paper px-[22px] pt-7 pb-8 font-serif text-paper-foreground shadow-[0_1px_2px_rgba(23,25,30,0.06),0_18px_40px_-12px_rgba(23,25,30,0.18)] sm:px-16 sm:pt-14 sm:pb-[60px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          {profile.issuer.logo ? (
            <img
              src={profile.issuer.logo}
              alt=""
              className="mb-2 h-auto max-h-9 w-auto max-w-40 self-start object-contain sm:max-h-11 sm:max-w-52"
            />
          ) : null}
          <span className="text-base font-semibold sm:text-xl">
            {profile.issuer.legalName}
          </span>
          <span className="font-sans text-xs leading-relaxed whitespace-pre-line text-paper-muted sm:text-[0.8125rem]">
            {profile.issuer.addressLines.join("\n")}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <PaperLabel>Invoice</PaperLabel>
          <span className="font-mono text-sm font-medium sm:text-lg">
            {calc.invoiceId}
          </span>
          <span className="text-[0.8125rem] sm:text-[0.9375rem]">
            {invoiceIssueDate(calc)}
          </span>
        </div>
      </div>

      <div className="mt-6 mb-5 h-px bg-paper-line sm:mt-9 sm:mb-7" />

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        <div className="flex flex-col gap-1.5">
          <PaperLabel>Bill to</PaperLabel>
          {profile.billTo.logo ? (
            <img
              src={profile.billTo.logo}
              alt=""
              className="my-1 h-auto max-h-7 w-auto max-w-32 self-start object-contain sm:max-h-8 sm:max-w-40"
            />
          ) : null}
          <span className="text-[0.9375rem] font-medium sm:text-base">
            {profile.billTo.name}
          </span>
          {profile.billTo.addressLines.length > 0 ? (
            <span className="font-sans text-xs leading-relaxed whitespace-pre-line text-paper-muted sm:text-[0.8125rem]">
              {profile.billTo.addressLines.join("\n")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <PaperLabel>Service</PaperLabel>
          <span className="text-[0.9375rem] sm:text-base">
            {profile.serviceDescription}
          </span>
          <span className="font-sans text-xs text-paper-muted sm:text-[0.8125rem]">
            {period}
          </span>
        </div>
      </div>

      <div className="mt-6 mb-5 flex flex-col gap-2 border-t border-b border-t-paper-foreground border-b-paper-line py-5 sm:mt-10 sm:mb-8 sm:py-7">
        <PaperLabel>Total due</PaperLabel>
        <span className="text-[2.375rem] leading-[1.05] font-medium tracking-[-0.02em] tabular-nums sm:text-[3.25rem]">
          {formatMoney(calc.invoiceCents)}
        </span>
        <span className="text-sm leading-snug text-paper-muted italic sm:text-base">
          {invoiceAmountWords(calc.invoiceCents)}
        </span>
      </div>

      <table className="w-full border-collapse text-sm sm:text-[0.9375rem]">
        <tbody>
          <tr className="border-b border-paper-line">
            <td className="py-2.5 sm:py-3">Base salary</td>
            <td className="py-2.5 text-right font-mono text-[0.8125rem] sm:py-3 sm:text-sm">
              {formatMoney(calc.baseCents)}
            </td>
          </tr>
          <tr className="border-b border-paper-line">
            <td className="py-2.5 sm:py-3">
              Overtime{" "}
              <span className="font-mono text-[0.8125rem] sm:text-sm">
                {formatDuration(calc.overtimeMinutes)}
              </span>{" "}
              at{" "}
              <span className="font-mono text-[0.8125rem] sm:text-sm">
                {overtimeRate}
              </span>
            </td>
            <td className="py-2.5 text-right font-mono text-[0.8125rem] sm:py-3 sm:text-sm">
              {formatMoney(calc.overtimeCents)}
            </td>
          </tr>
          <tr>
            <td className="pt-3.5 font-semibold">Total</td>
            <td className="pt-3.5 text-right font-mono text-sm font-medium sm:text-[0.9375rem]">
              {formatMoney(calc.invoiceCents)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-5 font-sans text-xs text-paper-muted sm:mt-7 sm:text-[0.8125rem]">
        {overtimeDaysLabel(calc.days.length)} in{" "}
        {period} →{" "}
        <span className="font-mono">{formatDuration(calc.overtimeMinutes)}</span>
      </p>

      <div className="mt-8 flex w-44 flex-col gap-1 sm:mt-14 sm:w-64">
        <div className="mb-2 h-px bg-paper-foreground" />
        <span className="text-sm sm:text-[0.9375rem]">
          {profile.issuer.signName}
        </span>
        <span className="font-sans text-xs text-paper-muted sm:text-[0.8125rem]">
          {profile.issuer.legalName}
        </span>
      </div>
    </article>
  )
}

function EmailCard({
  email,
  copied,
  onCopy,
}: {
  email: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E8EC] py-2 pr-2 pl-4 sm:py-2.5 sm:pr-3 sm:pl-[18px]">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Email
        </h2>
        <Button
          type="button"
          variant="outline"
          onClick={onCopy}
          className={
            copied
              ? "border-[#9CC9AF] bg-success-soft text-success hover:bg-success-soft hover:text-success"
              : undefined
          }
        >
          {copied ? (
            <CheckIcon data-icon="inline-start" weight="bold" />
          ) : (
            <CopyIcon data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy email"}
        </Button>
      </div>
      <pre className="px-4 pt-4 pb-5 font-sans text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap sm:px-[22px] sm:pt-5 sm:pb-6 sm:text-[0.90625rem]">
        {email}
      </pre>
    </section>
  )
}

function WaitingLetter({ noteErrorCount }: { noteErrorCount: number }) {
  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-[3px] border border-[#DCDFE3] bg-[#F6F6F4] px-6 py-10 sm:min-h-[760px] sm:px-16 sm:py-14">
      <div aria-hidden className="flex flex-col gap-3.5 opacity-55">
        <div className="flex justify-between">
          <div className="h-3.5 w-48 rounded-[3px] bg-[#E1E2DF]" />
          <div className="h-3.5 w-28 rounded-[3px] bg-[#E1E2DF]" />
        </div>
        <div className="h-2.5 w-40 rounded-[3px] bg-[#E7E8E5]" />
        <div className="h-2.5 w-36 rounded-[3px] bg-[#E7E8E5]" />
        <div className="my-6 h-px bg-[#E1E2DF]" />
        <div className="h-2 w-16 rounded-[3px] bg-[#E1E2DF]" />
        <div className="h-11 w-64 max-w-full rounded-[4px] bg-[#E7E8E5]" />
        <div className="h-2.5 w-96 max-w-full rounded-[3px] bg-[#E7E8E5]" />
        <div className="my-6 h-px bg-[#E1E2DF]" />
        <div className="flex justify-between">
          <div className="h-2.5 w-28 rounded-[3px] bg-[#E7E8E5]" />
          <div className="h-2.5 w-20 rounded-[3px] bg-[#E7E8E5]" />
        </div>
        <div className="flex justify-between">
          <div className="h-2.5 w-44 rounded-[3px] bg-[#E7E8E5]" />
          <div className="h-2.5 w-16 rounded-[3px] bg-[#E7E8E5]" />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
        <div className="flex max-w-[420px] flex-col gap-2.5 rounded-[10px] border border-border bg-card p-7 pb-6 shadow-[0_12px_32px_-12px_rgba(23,25,30,0.25)]">
          <p className="font-serif text-2xl font-medium">The letter is waiting.</p>
          <p className="text-[0.9375rem] leading-relaxed text-paper-muted">
            Fix the highlighted fields. The total and the email show up once
            the month lines up.
          </p>
          {noteErrorCount > 0 ? (
            <a
              href="#notes"
              className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-destructive underline underline-offset-4"
            >
              <WarningCircleIcon aria-hidden className="size-3.5" />
              {noteErrorCount === 1
                ? "1 problem in Overtime notes"
                : `${noteErrorCount} problems in Overtime notes`}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DaysRead({
  entries,
  dateOrder,
}: {
  entries: DayEntry[]
  dateOrder?: DateOrder
}) {
  const total = entries.reduce((sum, entry) => sum + entry.totalMinutes, 0)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Days read
        </h2>
        <span className="text-[0.8125rem] text-muted-foreground">
          {entries.length === 1 ? "1 day" : `${entries.length} days`} ·{" "}
          <span className="font-mono">{formatDuration(total)}</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        <Table className="min-w-[480px] text-sm">
          <TableHeader>
            <TableRow className="border-[#E6E8EC] hover:bg-transparent">
              <TableHead className="h-auto w-36 px-[18px] py-3 text-xs font-semibold text-muted-foreground">
                Day
              </TableHead>
              <TableHead className="h-auto w-24 px-[18px] py-3 text-right text-xs font-semibold text-muted-foreground">
                Hours
              </TableHead>
              <TableHead className="h-auto px-[18px] py-3 text-xs font-semibold text-muted-foreground">
                Tasks
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, index) => (
              <TableRow
                key={`${entry.month}-${entry.day}-${index}`}
                className="border-[#EEF0F2] align-top hover:bg-transparent"
              >
                <TableCell className="px-[18px] py-3.5">
                  {MONTHS[entry.month - 1]} {String(entry.day).padStart(2, "0")}
                </TableCell>
                <TableCell className="px-[18px] py-3.5 text-right font-mono">
                  {formatDuration(entry.totalMinutes)}
                </TableCell>
                <TableCell className="px-[18px] py-3.5 leading-relaxed whitespace-normal text-[#2B3038]">
                  {entry.tasks.length ? entry.tasks.join(", ") : "No tasks"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dateOrder ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          Dates like {dateOrder === "day-month" ? "05/10" : "10/05"} were read
          as {dateOrder === "day-month" ? "day/month" : "month/day"}.
        </p>
      ) : null}
    </section>
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
    const company =
      saved.profile.issuer.shortName.trim() || saved.profile.issuer.legalName.trim()
    return (
      <li
        key={saved.id}
        className={cn(
          "flex w-full min-w-0 items-center rounded-lg border bg-card",
          active
            ? "border-[1.5px] border-primary ring-[3px] ring-primary-soft"
            : "border-border",
        )}
      >
        <button
          type="button"
          aria-pressed={active}
          title={summary}
          onClick={() => onApply(saved)}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-l-lg py-3 pr-1 pl-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="truncate">{company}</span>
            {active ? (
              <span className="shrink-0 rounded-[4px] bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-primary">
                Active
              </span>
            ) : null}
          </span>
          <span className="truncate text-[0.8125rem] text-muted-foreground">
            {saved.profile.billTo.name} ·{" "}
            <span className="font-mono">
              {formatMoney(dollarsToCents(saved.profile.hourlyRate))}/h
            </span>{" "}
            ·{" "}
            <span className="font-mono">
              {formatPercent(saved.profile.overtimePercent)}
            </span>
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete ${summary}`}
          onClick={() => onDelete(saved.id)}
          className="text-muted-foreground"
        >
          <TrashIcon />
        </Button>
      </li>
    )
  })

  if (profiles.length <= 4) {
    return <ul className="flex flex-col gap-2">{rows}</ul>
  }

  return (
    <ScrollArea className="h-64">
      <ul className="flex flex-col gap-2 p-1 pr-3">{rows}</ul>
    </ScrollArea>
  )
}
