import { t } from './index.jsx'
// "weekly" (as stored) -> "Weekly" / "每周" / "매주"
export const freqLabel = (f) => {
  const k = String(f || '').toLowerCase()
  return ['daily', 'weekly', 'monthly'].includes(k) ? t(`freq_${k}`) : (f ? t('freq_recurring') : t('freq_recurring'))
}
