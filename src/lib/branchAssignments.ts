import { Branch, SalesRep } from './repository';

export function getRepsForBranch(
  reps: SalesRep[],
  branches: Branch[],
  branchId: string
): SalesRep[] {
  const branch = branches.find((candidate) => candidate.id === branchId && candidate.isActive);
  if (!branch) return [];
  return reps.filter((rep) => rep.isActive && rep.branch?.trim() === branch.name);
}

export function retainRepForBranch(
  repId: string,
  branchId: string,
  reps: SalesRep[],
  branches: Branch[]
): string {
  return getRepsForBranch(reps, branches, branchId).some((rep) => rep.id === repId) ? repId : '';
}
