import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type {
  Assignment,
  AssignmentInput,
  AssignmentList,
  AssignmentPatch,
} from "../../lib/types";

export const assignmentsKeys = {
  lists: (includeCompleted: boolean) => ["assignments", { includeCompleted }] as const,
  detail: (id: string) => ["assignments", id] as const,
};

/** Infinite cursor-paginated list for the Home page. */
export function useAssignments(includeCompleted: boolean) {
  return useInfiniteQuery({
    queryKey: assignmentsKeys.lists(includeCompleted),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      return api.get<AssignmentList>(
        `/assignments?include_completed=${includeCompleted}${cursor}`,
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

export function useAssignment(id: string) {
  return useQuery({
    queryKey: assignmentsKeys.detail(id),
    queryFn: () => api.get<Assignment>(`/assignments/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignmentInput) => api.post<Assignment>("/assignments", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & AssignmentPatch) =>
      api.patch<Assignment>(`/assignments/${id}`, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.setQueryData(assignmentsKeys.detail(data.id), data);
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });
}
