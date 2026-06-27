export enum CandidateStatus {
  NEW = 'new',
  ACTIVE = 'active',
  PLACED = 'placed',
  ON_HOLD = 'on_hold',
  DISCARDED = 'discarded',
}

export enum Seniority {
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
}

export enum OpportunityStatus {
  OPEN = 'open',
  WON = 'won',
  LOST = 'lost',
}

export enum ApplicationStage {
  APPLIED = 'applied',
  SCREENING = 'screening',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  HIRED = 'hired',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

export enum PlacementStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

export enum ContactDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}
