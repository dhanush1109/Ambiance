import MoodCard from '../components/MoodCard'
import { MOODS } from '../data/moods'
import { useLightStore } from '../state/lightStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import './screens.css'

export default function MoodsScreen() {
  const activeMoodId = useLightStore((s) => s.activeMoodId)
  const connected = useConnectionStore(isConnected)
  const showToast = useUiStore((s) => s.showToast)

  return (
    <div className="screen">
      <h1 className="screen-title">Moods</h1>
      <p className="screen-sub">
        Each mood is a pair: one colour for the front cabin, another for handles and
        feet. If you have a single zone selected, only that half is applied.
      </p>

      {!connected ? (
        <p className="screen-note">
          Connect your controller on the Home screen to apply a mood.
        </p>
      ) : null}

      <div className="grid-moods">
        {MOODS.map((m, i) => (
          <div key={m.id} className="anim-rise" style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}>
            <MoodCard
              mood={m}
              active={activeMoodId === m.id}
              disabled={!connected}
              onPress={(mood) => {
                haptics.tap()
                controller.applyMood(mood)
                showToast(mood.name, 'ok')
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
