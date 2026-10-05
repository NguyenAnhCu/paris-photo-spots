// /dev — component gallery to compare against the prototype at 375px and 1440px.
// Developer-only page: its fixed sample values are data, not UI copy.
import { Camera, Clock, Cloud, Images, Plus, SlidersHorizontal, Users, X } from 'lucide-react'
import { useState } from 'react'
import { CategoryChip, IconButton, PillButton, StatTile, Tag } from '@/components/ui'
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher'
import { useI18n } from '@/i18n/useI18n'
import { SPOT_CATEGORIES, type SpotCategory } from '@/types/spot'
import './DevPage.css'

export function DevPage() {
  const { t } = useI18n()
  const [cat, setCat] = useState<SpotCategory | 'all'>('all')
  return (
    <main className="dev">
      <h1>UI kit</h1>
      <section>
        <h2>PillButton</h2>
        <div className="dev__row">
          <PillButton variant="primary" icon={Plus} size="lg">
            {t('add.button')}
          </PillButton>
          <PillButton variant="tonal" icon={SlidersHorizontal}>
            {t('filter.button')}
          </PillButton>
          <PillButton variant="tonal" icon={Images}>
            {t('detail.viewPhotos', { count: 12 })}
          </PillButton>
          <PillButton variant="clay" icon={Camera}>
            {t('detail.addPhoto')}
          </PillButton>
          <PillButton variant="dark">{t('nav.list')}</PillButton>
          <PillButton variant="primary" disabled>
            {t('add.submit')}
          </PillButton>
          <IconButton icon={X} label={t('common.close')} />
          <LanguageSwitcher />
        </div>
      </section>
      <section>
        <h2>CategoryChip</h2>
        <div className="dev__row">
          {(['all', ...SPOT_CATEGORIES] as const).map((c) => (
            <CategoryChip key={c} category={c} selected={cat === c} onSelect={() => setCat(c)} />
          ))}
        </div>
      </section>
      <section>
        <h2>Tag</h2>
        <div className="dev__row">
          <Tag tone="crowd-1">{t('crowd.quiet')}</Tag>
          <Tag tone="crowd-2">{t('crowd.moderate')}</Tag>
          <Tag tone="crowd-3">{t('crowd.busy')}</Tag>
          <Tag tone="neutral">{t('bestTime.sunset')}</Tag>
          <Tag>{t('list.count', { count: 262 })}</Tag>
          <Tag tone="mono">35mm</Tag>
          <Tag tone="mono">f/1.8</Tag>
        </div>
      </section>
      <section>
        <h2>StatTile</h2>
        <div className="dev__tiles">
          <StatTile icon={Users} label={t('detail.crowd')} value={t('crowd.busy')} />
          <StatTile icon={Clock} label={t('detail.bestTime')} value={t('bestTime.sunrise')} />
          <StatTile icon={Cloud} label={t('detail.weather')} value={t('weather.value', { temp: 21, label: t('weather.cloudy') })} />
        </div>
        <div className="dev__tiles">
          <StatTile stacked icon={Users} label={t('detail.crowd')} value={t('crowd.busy')} />
          <StatTile stacked icon={Clock} label={t('detail.bestTime')} value={t('bestTime.sunrise')} />
          <StatTile stacked icon={Cloud} label={t('detail.weather')} value={t('weather.value', { temp: 21, label: t('weather.cloudy') })} />
        </div>
      </section>
    </main>
  )
}
