// Velfi Smart Contract — Sui Testnet
export const PACKAGE_ID = '0x6d8e6f2e8125b6358570a651f182d4b1f636694d712643a66d59b307fba8b82c'
export const NETWORK = 'testnet'

// Contract functions
export const STREAM = {
  start:       `${PACKAGE_ID}::stream::start_stream`,
  claim:       `${PACKAGE_ID}::stream::claim_stream`,
  stop:        `${PACKAGE_ID}::stream::stop_stream`,
  startSplit:  `${PACKAGE_ID}::stream::start_split_stream`,
  claimSplit:  `${PACKAGE_ID}::stream::claim_split_stream`,
  createSafe:  `${PACKAGE_ID}::stream::create_safe_pay`,
  confirmSend: `${PACKAGE_ID}::stream::sender_confirm`,
  confirmRecv: `${PACKAGE_ID}::stream::recipient_confirm`,
  reclaimSafe: `${PACKAGE_ID}::stream::reclaim_safe_pay`,
  createStage: `${PACKAGE_ID}::stream::create_stage_pay`,
  releaseStage:`${PACKAGE_ID}::stream::release_next_stage`,
  cancelStage: `${PACKAGE_ID}::stream::cancel_stage_pay`,
}
