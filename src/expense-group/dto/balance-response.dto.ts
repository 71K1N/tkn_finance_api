export interface GroupBalanceDto {
  user_id: number;
  balance: number;
}

export interface SettlementSuggestionDto {
  from_user_id: number;
  to_user_id: number;
  amount: number;
}
