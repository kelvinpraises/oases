export type PhysicalClass = 'Actor' | 'Place' | 'Act' | 'Bond'

export interface ProtocolCharacter {
  id: string
  name: string
  classType: PhysicalClass
  subClass?: string
  targetAddress: string
  subgraphEndpoint: string
  primaryMetric: string
  currentMetricValue: string
  description: string
  anomalyStatus?: 'CALM' | 'STIR' | 'STRAIN' | 'BREACH' | 'BROKEN'
  activeTensionCastIds?: string[]
}
