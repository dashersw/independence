import React from 'react'
import { ActionPanel } from './hud/ActionPanel'
import { CampaignStatus } from './hud/CampaignStatus'
import { FactionRail } from './hud/FactionRail'
import { GameLog } from './hud/GameLog'
import type { HudProps } from './hud/types'

const Hud = (props: HudProps) => (
  <>
    <CampaignStatus game={props.game} />
    <FactionRail game={props.game} />
    <GameLog game={props.game} />
    <ActionPanel {...props} />
  </>
)

export default Hud
