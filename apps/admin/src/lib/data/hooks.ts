"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminActionInput,
  AccountStatus,
  AuditFilter,
  FinanceFilter,
  InvestmentAdminFilter,
  InvestmentStatus,
  KycDecisionInput,
  KycFilter,
  PageRequest,
  RewardGrantStatus,
  RoundFilter,
  UserFilter,
  WithdrawalDecisionInput,
} from "@rentbrown/types";

import { useDataSource, useRole } from "./provider";

function useKey() {
  const { role } = useRole();
  return (...parts: unknown[]) => ["rb-admin", role, ...parts] as const;
}

export function useRoles() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("roles"), queryFn: () => ds.listRoles(), staleTime: Infinity });
}

export function useAdminDashboard() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("dashboard"), queryFn: () => ds.getDashboard() });
}

export function useUsers(filter?: UserFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("users", filter), queryFn: () => ds.listUsers(filter) });
}

export function useUser(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("user", id), queryFn: () => ds.getUser(id) });
}

export function useSetUserStatus() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminActionInput & { userId: string; status: AccountStatus }) => ds.setUserStatus(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useKycCases(filter?: KycFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("kyc", filter), queryFn: () => ds.listKycCases(filter) });
}

export function useKycCase(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("kyc-case", id), queryFn: () => ds.getKycCase(id) });
}

export function useDecideKyc() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KycDecisionInput) => ds.decideKyc(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useProperties(filter?: PageRequest) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("properties", filter), queryFn: () => ds.listProperties(filter) });
}

export function useProperty(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("property", id), queryFn: () => ds.getProperty(id) });
}

export function usePlans(filter?: PageRequest) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("plans", filter), queryFn: () => ds.listPlans(filter) });
}

export function usePlan(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("plan", id), queryFn: () => ds.getPlan(id) });
}

export function useRounds(filter?: RoundFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("rounds", filter), queryFn: () => ds.listRounds(filter) });
}

export function useRound(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("round", id), queryFn: () => ds.getRound(id) });
}

export function useAdminInvestments(filter?: InvestmentAdminFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("investments", filter), queryFn: () => ds.listInvestments(filter) });
}

export function useAdminInvestment(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("investment", id), queryFn: () => ds.getInvestment(id) });
}

export function useMarkInvestmentReview() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminActionInput & { investmentId: string }) => ds.markInvestmentReview(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useResolveInvestmentReview() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminActionInput & { investmentId: string; to: InvestmentStatus }) => ds.resolveInvestmentReview(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRetrySettlement() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminActionInput & { investmentId: string }) => ds.retrySettlement(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useInvestmentReconciliation(enabled: boolean) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("investment-reconciliation"), queryFn: () => ds.reconcileInvestments(), enabled });
}

export function useLedgerOverview() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("ledger"), queryFn: () => ds.getLedgerOverview() });
}

export function useDeposits(filter?: FinanceFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("deposits", filter), queryFn: () => ds.listDeposits(filter) });
}

export function useWithdrawals(filter?: FinanceFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("withdrawals", filter), queryFn: () => ds.listWithdrawals(filter) });
}

export function useWithdrawal(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("withdrawal", id), queryFn: () => ds.getWithdrawal(id) });
}

export function useDecideWithdrawal() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WithdrawalDecisionInput) => ds.decideWithdrawal(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useWithdrawalReconciliation(enabled = true) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("withdrawal-reconciliation"), queryFn: () => ds.reconcileWithdrawals(), enabled });
}

export function useKycReconciliation(enabled = true) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("kyc-reconciliation"), queryFn: () => ds.reconcileKyc(), enabled });
}

export function useTransactions(filter?: FinanceFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("transactions", filter), queryFn: () => ds.listTransactions(filter) });
}

export function useReconciliation(filter?: FinanceFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("reconciliation", filter), queryFn: () => ds.listReconciliation(filter) });
}

export function useReferralOverview() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("referral-overview"), queryFn: () => ds.getReferralOverview() });
}

export function useReferrals(filter?: PageRequest) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("referrals", filter), queryFn: () => ds.listReferrals(filter) });
}

export function useRewardGrants(filter?: PageRequest & { status?: RewardGrantStatus[] }) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("reward-grants", filter), queryFn: () => ds.listRewardGrants(filter) });
}

export function useNotificationOverview() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("notifications"), queryFn: () => ds.getNotificationOverview() });
}

export function usePolicies() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("policies"), queryFn: () => ds.getPolicies() });
}

export function useAuditEvents(filter?: AuditFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("audit", filter), queryFn: () => ds.listAuditEvents(filter) });
}

export function useLegalDocuments() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("legal"), queryFn: () => ds.listLegalDocuments(), staleTime: Infinity });
}

export function useReports(period: "7d" | "30d" | "90d") {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("reports", period), queryFn: () => ds.getReports(period) });
}
