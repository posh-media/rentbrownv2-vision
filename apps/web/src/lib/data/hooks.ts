"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  InvestmentFilter,
  MinorUnits,
  OpportunityFilter,
  RequestWithdrawalInput,
  SignInInput,
  SignUpInput,
  SubmitInvestmentInput,
  TransactionFilter,
  CreateDepositInput,
} from "@rentbrown/types";

import { useDataSource, useScenarioKey } from "./provider";

function useKey() {
  const scenario = useScenarioKey();
  return (...parts: unknown[]) => ["rb", scenario, ...parts] as const;
}

export function useSession() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("session"), queryFn: () => ds.getSession() });
}

export function useSignIn() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => ds.signIn(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSignUp() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) => ds.signUp(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSignOut() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ds.signOut(),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useProfile() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("profile"), queryFn: () => ds.getProfile() });
}

export function useDashboard() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("dashboard"), queryFn: () => ds.getDashboard() });
}

export function useOpportunities(filter?: OpportunityFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("opportunities", filter),
    queryFn: () => ds.listOpportunities(filter),
  });
}

export function useOpportunity(slug: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("opportunity", slug), queryFn: () => ds.getOpportunity(slug) });
}

export function useInvestmentQuote(roundId: string, slots: number) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("quote", roundId, slots),
    queryFn: () => ds.quoteInvestment(roundId, slots),
    placeholderData: keepPreviousData,
  });
}

export function useSubmitInvestment() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitInvestmentInput) => ds.submitInvestment(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSubmission(reference: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("submission", reference),
    queryFn: () => ds.getSubmission(reference),
    refetchInterval: (query) => {
      const status = query.state.data?.paymentStatus;
      return status === "PENDING" || status === "CONFIRMING" ? 3000 : false;
    },
  });
}

export function useInvestments(filter?: InvestmentFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("investments", filter), queryFn: () => ds.listInvestments(filter) });
}

export function useInvestment(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("investment", id), queryFn: () => ds.getInvestment(id) });
}

export function useWallet() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("wallet"), queryFn: () => ds.getWallet() });
}

export function useTransactions(filter?: TransactionFilter) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("transactions", filter), queryFn: () => ds.listTransactions(filter) });
}

export function useTransaction(id: string | null) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("transaction", id),
    queryFn: () => ds.getTransaction(id!),
    enabled: id !== null,
  });
}

export function useDeposit(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("deposit", id),
    queryFn: () => ds.getDeposit(id),
    refetchInterval: (query) => (query.state.data?.status === "CONFIRMING" ? 3000 : false),
  });
}

export function useWithdrawalQuote(amount: MinorUnits | null, destinationId?: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("withdrawal-quote", amount, destinationId),
    queryFn: () => ds.quoteWithdrawal(amount ?? 0, destinationId),
    placeholderData: keepPreviousData,
  });
}

export function useWithdrawal(id: string) {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({
    queryKey: key("withdrawal", id),
    queryFn: () => ds.getWithdrawal(id),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "REQUESTED" || s === "UNDER_REVIEW" || s === "APPROVED" || s === "PROCESSING" ? 4000 : false;
    },
  });
}

export function useWithdrawals() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("withdrawals"), queryFn: () => ds.listWithdrawals() });
}

export function useCreateDeposit() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepositInput) => ds.createDeposit(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRequestWithdrawal() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestWithdrawalInput) => ds.requestWithdrawal(input),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useNotifications() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("notifications"), queryFn: () => ds.listNotifications() });
}

export function useMarkRead() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => ds.markNotificationRead(id), onSuccess: () => qc.invalidateQueries() });
}

export function useMarkAllRead() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => ds.markAllNotificationsRead(), onSuccess: () => qc.invalidateQueries() });
}

export function useKyc() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("kyc"), queryFn: () => ds.getKyc() });
}

export function useReferralSummary() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("referral-summary"), queryFn: () => ds.getReferralSummary() });
}

export function useReferrals() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("referrals"), queryFn: () => ds.listReferrals() });
}

export function useContent() {
  const ds = useDataSource();
  const key = useKey();
  return useQuery({ queryKey: key("content"), queryFn: () => ds.getContent(), staleTime: Infinity });
}
