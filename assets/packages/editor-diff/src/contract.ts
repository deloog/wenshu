export type DiffKind = "added" | "changed" | "removed";

export interface DiffAnchor {
  readonly nodeId: string;
  readonly parentId: string | undefined;
  readonly ancestorIds: readonly string[];
  readonly siblingIndex: number;
}

export interface FieldDiff {
  readonly id: string;
  readonly kind: DiffKind;
  readonly anchor: DiffAnchor;
  readonly field: string;
  readonly before: string | number | boolean | null | undefined;
  readonly after: string | number | boolean | null | undefined;
}

export type ProposalStatus = "pending" | "accepted" | "rejected" | "reverted";

export interface DiffProposal {
  readonly id: string;
  readonly diffs: readonly FieldDiff[];
  readonly request: unknown;
  readonly status: ProposalStatus;
}

export type ReviewResult =
  | { readonly status: "accepted"; readonly proposal: DiffProposal }
  | { readonly status: "rejected"; readonly proposal: DiffProposal }
  | { readonly status: "reverted"; readonly proposal: DiffProposal }
  | {
      readonly status: "not_accepted" | "not_pending" | "transaction_rolled_back";
      readonly proposal: DiffProposal | undefined;
    };
