import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePoll } from '../lib/api.js'
import { Top, Seg, Panel } from '../ui/kit.jsx'
import { ActivityList } from '../components/sheets.jsx'

export default function Activity() {
  const navigate = useNavigate()
  const { data } = usePoll('/agent/activity?limit=50', 15000)
  const [filter, setFilter] = useState('all')
  return (
    <main className="page screen">
      <Top left={<button className="circle-btn" onClick={() => navigate('/')} aria-label="Back to home"><ArrowLeft size={20} /></button>} eyebrow="Every payment" title="Activity" />
      <div className="stack">
        <Seg label="Show" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'out', label: 'Sent' }, { id: 'in', label: 'Received' }]} />
        <Panel><ActivityList rows={data ? data.transactions || [] : null} filter={filter} /></Panel>
      </div>
    </main>
  )
}
