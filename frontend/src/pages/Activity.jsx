import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePoll } from '../lib/api.js'
import { Top, Seg, Panel } from '../ui/kit.jsx'
import { ActivityList } from '../components/sheets.jsx'
import { t } from '../i18n/index.jsx'

export default function Activity() {
  const navigate = useNavigate()
  const { data } = usePoll('/agent/activity?limit=50', 15000)
  const [filter, setFilter] = useState('all')
  return (
    <main className="page screen">
      <Top left={<button className="circle-btn" onClick={() => navigate('/')} aria-label={t('backHome')}><ArrowLeft size={20} /></button>} eyebrow={t('everyPayment')} title={t('activityTitle')} />
      <div className="stack">
        <Seg label={t('show')} value={filter} onChange={setFilter} options={[{ id: 'all', label: t('all') }, { id: 'out', label: t('sent') }, { id: 'in', label: t('received') }]} />
        <Panel><ActivityList rows={data ? data.transactions || [] : null} filter={filter} /></Panel>
      </div>
    </main>
  )
}
