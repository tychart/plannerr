import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { itemsQueryString, localTimezone } from "../../lib/items";
import type { Item, ItemInput, ItemList, ItemListQuery, ItemPatch } from "../../lib/types";

/** Prefix for every item query — invalidating ["items"] refreshes Home, the
 *  sidebar, all three library pages, and every detail page at once. */
export const itemsKeys = {
  all: ["items"] as const,
  detail: (id: string) => ["items", id] as const,
};

export function useItems(query: ItemListQuery) {
  // tz resolves per query so server-side day windows match the local calendar.
  const qs = itemsQueryString({ tz: localTimezone(), ...query });
  return useInfiniteQuery({
    queryKey: ["items", "list", qs],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      return api.get<ItemList>(`/items?${qs}${cursor}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    placeholderData: (previous) => previous, // keep the old list while filters refetch
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: itemsKeys.detail(id),
    queryFn: () => api.get<Item>(`/items/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ItemInput) => api.post<Item>("/items", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemsKeys.all }),
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & ItemPatch) =>
      api.patch<Item>(`/items/${id}`, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: itemsKeys.all });
      queryClient.setQueryData(itemsKeys.detail(data.id), data);
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemsKeys.all }),
  });
}
