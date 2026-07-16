import { ChevronIcon } from './Icons.jsx'

const DATE_KEY = /(data|date|criado|atualizado|inicio|fim|entrada|exclusao|opcao)/i
const CNPJ_KEY = /cnpj/i
const CEP_KEY = /cep/i
const MONEY_KEY = /(capital_social|valor|capital|receita|faturamento)/i
const PHONE_KEY = /(telefone|celular|fone|fax)/i

function isEmpty(value) {
  return value === null || value === undefined || value === ''
}

function formatCnpj(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 14)
  if (digits.length !== 14) return value
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function formatCep(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8)
  if (digits.length !== 8) return value
  return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2')
}

function formatPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  if (digits.length === 9) return digits.replace(/^(\d{5})(\d{4})$/, '$1-$2')
  if (digits.length === 8) return digits.replace(/^(\d{4})(\d{4})$/, '$1-$2')
  return value
}

function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  const hasTime = value.length > 10
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    ...(hasTime ? { timeStyle: 'short' } : {}),
  }).format(date)
}

function formatMoney(value) {
  const number = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(number)) return value
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(number)
}

export function humanizeKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function formatValue(key, value) {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (isEmpty(value)) return 'Não informado'
  if (CNPJ_KEY.test(key)) return formatCnpj(value)
  if (CEP_KEY.test(key)) return formatCep(value)
  if (MONEY_KEY.test(key)) return formatMoney(value)
  if (PHONE_KEY.test(key)) return formatPhone(value)
  if (DATE_KEY.test(key)) return formatDate(value)
  return String(value)
}

export function countFilledFields(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countFilledFields(item), 0)
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((total, item) => total + countFilledFields(item), 0)
  }

  return isEmpty(value) ? 0 : 1
}

function PrimitiveField({ fieldKey, value }) {
  const display = formatValue(fieldKey, value)
  const muted = display === 'Não informado'

  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 transition hover:border-cyan-400/20 hover:bg-white/[0.04]">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {humanizeKey(fieldKey)}
      </dt>
      <dd
        className={`mt-1.5 break-words text-sm leading-6 ${
          muted ? 'italic text-slate-600' : 'text-slate-200'
        }`}
      >
        {display}
      </dd>
    </div>
  )
}

function ObjectGroup({ label, value, depth }) {
  const entries = Object.entries(value)
  const primitives = entries.filter(([, item]) => !item || typeof item !== 'object')
  const nested = entries.filter(([, item]) => item && typeof item === 'object')

  return (
    <details
      open={depth < 1}
      className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b111d]/80"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">{humanizeKey(label)}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {entries.length} {entries.length === 1 ? 'propriedade' : 'propriedades'}
          </p>
        </div>
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-90" />
      </summary>

      <div className="border-t border-white/[0.06] p-3 sm:p-4">
        {primitives.length > 0 && (
          <dl className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {primitives.map(([key, item]) => (
              <PrimitiveField key={key} fieldKey={key} value={item} />
            ))}
          </dl>
        )}

        {nested.length > 0 && (
          <div className={`${primitives.length > 0 ? 'mt-3' : ''} space-y-3`}>
            {nested.map(([key, item]) => (
              <JsonNode key={key} label={key} value={item} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}

function ArrayGroup({ label, value, depth }) {
  return (
    <details open={depth < 1} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b111d]/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-100">{humanizeKey(label)}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {value.length} {value.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
        <ChevronIcon className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-90" />
      </summary>

      <div className="space-y-3 border-t border-white/[0.06] p-3 sm:p-4">
        {value.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-slate-500">
            Lista vazia
          </p>
        ) : (
          value.map((item, index) => (
            <div key={index} className="rounded-xl border border-white/[0.06] bg-black/10 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <span className="grid h-6 min-w-6 place-items-center rounded-md bg-white/[0.05] px-1.5 text-[11px] text-slate-400">
                  {index + 1}
                </span>
                Item
              </div>
              {item && typeof item === 'object' ? (
                <JsonNode label={`item_${index + 1}`} value={item} depth={depth + 1} compact />
              ) : (
                <PrimitiveField fieldKey={`item_${index + 1}`} value={item} />
              )}
            </div>
          ))
        )}
      </div>
    </details>
  )
}

function JsonNode({ label, value, depth = 0, compact = false }) {
  if (Array.isArray(value)) {
    return <ArrayGroup label={label} value={value} depth={depth} />
  }

  if (value && typeof value === 'object') {
    if (compact) {
      const entries = Object.entries(value)
      const primitives = entries.filter(([, item]) => !item || typeof item !== 'object')
      const nested = entries.filter(([, item]) => item && typeof item === 'object')
      return (
        <div>
          {primitives.length > 0 && (
            <dl className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {primitives.map(([key, item]) => (
                <PrimitiveField key={key} fieldKey={key} value={item} />
              ))}
            </dl>
          )}
          {nested.length > 0 && (
            <div className={`${primitives.length > 0 ? 'mt-3' : ''} space-y-3`}>
              {nested.map(([key, item]) => (
                <JsonNode key={key} label={key} value={item} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )
    }

    return <ObjectGroup label={label} value={value} depth={depth} />
  }

  return <PrimitiveField fieldKey={label} value={value} />
}

export default function JsonExplorer({ data }) {
  return (
    <div className="space-y-3">
      {Object.entries(data).map(([key, value]) => (
        <JsonNode key={key} label={key} value={value} />
      ))}
    </div>
  )
}
