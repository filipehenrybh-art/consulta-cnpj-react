import { BuildingIcon, CheckIcon, UsersIcon } from './Icons.jsx'

const highlights = [
  'Relatório profissional em PDF',
  'Campos analíticos organizados',
  'Checklist de certidões e vencimentos',
]

export default function SampleReportPreview() {
  return (
    <section aria-label="Exemplo demonstrativo do relatório Premium" className="h-full rounded-2xl border border-white/[0.09] bg-[#070c15] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-200">
            Dados fictícios
          </span>
          <h3 className="mt-3 text-lg font-semibold text-white">Exemplo do relatório Premium</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Uma prévia do documento disponível após a consulta.</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/15 bg-violet-300/[0.07] text-violet-200">
          <BuildingIcon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Empresa consultada</p>
            <p className="mt-1 text-sm font-semibold text-white">Empresa Demonstração Ltda.</p>
            <p className="mt-1 text-[11px] text-slate-500">CNPJ 00.000.000/0000-00</p>
          </div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.09] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Ativa</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <ReportField label="Nome fantasia" value="Pilar Demo" />
        <ReportField label="Capital social" value="R$ 150.000,00" />
        <ReportField label="Abertura" value="15/03/2021" />
        <ReportField label="Cidade / UF" value="Belo Horizonte / MG" />
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <UsersIcon className="h-4 w-4 text-cyan-300" />
          Sócios e responsáveis
        </div>
        <div className="mt-3 space-y-2">
          <PartnerRow name="Marina Oliveira" role="Sócia-administradora" />
          <PartnerRow name="Carlos Souza" role="Sócio" />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-violet-300/10 bg-violet-300/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">Conteúdo Premium</p>
        <ul className="mt-3 space-y-2">
          {highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-5 text-slate-400">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-violet-400/15 text-violet-300">
                <CheckIcon className="h-3 w-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-center text-[10px] leading-4 text-slate-600">Exemplo meramente ilustrativo. Os campos disponíveis variam conforme os dados retornados para cada CNPJ.</p>
    </section>
  )
}

function ReportField({ label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      <p className="mt-1.5 font-medium leading-5 text-slate-300">{value}</p>
    </div>
  )
}

function PartnerRow({ name, role }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2">
      <span className="text-[11px] font-medium text-slate-300">{name}</span>
      <span className="text-right text-[10px] text-slate-600">{role}</span>
    </div>
  )
}
