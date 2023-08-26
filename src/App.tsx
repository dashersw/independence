import React from 'react'
import EventCard from './components/EventCard'
import Hud from './components/Hud'
import IntroScreen from './components/IntroScreen'
import MapView from './components/MapView'
import SettingsMenu from './components/SettingsMenu'
import { useGameSession } from './components/game/hooks/useGameSession'
import { FlagIcon } from './components/map-flags'
import { t } from './i18n'

const App = () => {
  const session = useGameSession()
  const { game, interaction } = session

  return (
    <div className="app">
      {session.gameMounted && (
        <>
          <MapView
            territories={game.territories}
            selected={interaction.selected}
            targets={interaction.targets}
            convoys={game.movement.convoys}
            round={game.turn.round}
            onTerritoryClick={interaction.onTerritoryClick}
            onReady={() => session.setMapReady(true)}
          />
          <Hud
            game={game}
            selected={interaction.selected}
            fortifyTarget={interaction.fortifyTarget}
            lastBattle={interaction.lastBattle}
            onFortifyAmount={interaction.onFortifyAmount}
            onAdvance={interaction.onAdvance}
            onLandingResolve={interaction.onLandingResolve}
            onCancelSelection={interaction.clearSelection}
            onEndPhase={interaction.endPhase}
            onAutoPlace={interaction.onAutoPlace}
            onTrade={interaction.onTrade}
            onAttackPress={interaction.onAttackPress}
            onAttackBlitz={interaction.onAttackBlitz}
            onPullBack={interaction.onPullBack}
          />
          <SettingsMenu onSave={session.save} onLoad={session.load} defaultSaveName={session.defaultSaveName} />
          {session.entries.length > 0 && game.turn.phase !== 'gameover' && (
            <EventCard
              entries={session.entries}
              choices={session.decision?.choices}
              onDismiss={session.dismissCards}
              onChoose={session.resolveDecision}
            />
          )}
          {session.outcome && (
            <div className="overlay">
              <div className="overlay-card">
                <h2>
                  {t(session.outcome.titleKey)}
                  {game.winner && <FlagIcon faction="Turkey" className="victory-flag" />}
                </h2>
                <p>{t(session.outcome.bodyKey, session.outcome.vars)}</p>
                <button className="primary" onClick={() => window.location.reload()}>
                  {t('overlay.playAgain')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!session.started && (
        <IntroScreen
          onStart={() => session.setGameMounted(true)}
          onBegin={() => session.setStarted(true)}
          mapReady={session.mapReady}
        />
      )}
    </div>
  )
}

export default App
