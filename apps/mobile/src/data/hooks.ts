import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDataSource, useSession } from "./provider";

/** Same hook names as apps/web — screens stay symmetrical. */
export function useProfile() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => ds.getProfile(),
    enabled: !!session.data,
  });
}

export function useKyc() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["kyc"],
    queryFn: () => ds.getKyc(),
    enabled: !!session.data,
  });
}

export function useDashboard() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => ds.getDashboard(),
    enabled: !!session.data,
  });
}

export function useOpportunities() {
  const ds = useDataSource();
  return useQuery({ queryKey: ["opportunities"], queryFn: () => ds.listOpportunities() });
}

export function useOpportunity(slug: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["opportunity", slug],
    queryFn: () => ds.getOpportunity(slug),
    enabled: !!slug,
  });
}

export function useInvestmentQuote(roundId: string, slots: number) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["investment-quote", roundId, slots],
    queryFn: () => ds.quoteInvestment(roundId, slots),
    enabled: !!roundId && slots > 0,
    placeholderData: (prev) => prev,
  });
}

export function useSubmitInvestment() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ds.submitInvestment.bind(ds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["investments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });
}

export function useSubmission(reference: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["submission", reference],
    queryFn: () => ds.getSubmission(reference),
    enabled: !!reference,
    refetchInterval: (q) => {
      const s = q.state.data?.paymentStatus;
      return s === "PENDING" || s === "CONFIRMING" ? 2000 : false;
    },
  });
}

export function useInvestments() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["investments"],
    queryFn: () => ds.listInvestments(),
    enabled: !!session.data,
  });
}

export function useInvestment(id: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["investment", id],
    queryFn: () => ds.getInvestment(id),
    enabled: !!id,
  });
}

export function useWallet() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["wallet"],
    queryFn: () => ds.getWallet(),
    enabled: !!session.data,
  });
}

export function useTransactions() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["transactions"],
    queryFn: () => ds.listTransactions(),
    enabled: !!session.data,
  });
}

export function useTransaction(id: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: () => ds.getTransaction(id),
    enabled: !!id,
  });
}

export function useCreateDeposit() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ds.createDeposit.bind(ds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useDeposit(id: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["deposit", id],
    queryFn: () => ds.getDeposit(id),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "CONFIRMING" ? 2000 : false),
  });
}

export function useWithdrawalQuote(amountMinor: number | null, destinationId?: string) {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["withdrawal-quote", amountMinor, destinationId],
    queryFn: () => ds.quoteWithdrawal(amountMinor ?? 0, destinationId),
    enabled: !!session.data && amountMinor != null,
    placeholderData: (prev) => prev,
  });
}

export function useRequestWithdrawal() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ds.requestWithdrawal.bind(ds),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      void qc.invalidateQueries({ queryKey: ["withdrawals"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useWithdrawal(id: string) {
  const ds = useDataSource();
  return useQuery({
    queryKey: ["withdrawal", id],
    queryFn: () => ds.getWithdrawal(id),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "REQUESTED" || s === "UNDER_REVIEW" || s === "APPROVED" || s === "PROCESSING"
        ? 3000
        : false;
    },
  });
}

export function useWithdrawals() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["withdrawals"],
    queryFn: () => ds.listWithdrawals(),
    enabled: !!session.data,
  });
}

export function usePinStatus() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["pin-status"],
    queryFn: () => ds.hasTransactionPin(),
    enabled: !!session.data,
  });
}

export function useSetTransactionPin() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => ds.setTransactionPin(pin),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useReferralSummary() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["referral-summary"],
    queryFn: () => ds.getReferralSummary(),
    enabled: !!session.data,
  });
}

export function useReferrals() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["referrals"],
    queryFn: () => ds.listReferrals(),
    enabled: !!session.data,
  });
}

export function useNotifications() {
  const ds = useDataSource();
  const session = useSession();
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => ds.listNotifications(),
    enabled: !!session.data,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ds.markNotificationRead.bind(ds),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const ds = useDataSource();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ds.markAllNotificationsRead.bind(ds),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useContent() {
  const ds = useDataSource();
  return useQuery({ queryKey: ["content"], queryFn: () => ds.getContent() });
}
