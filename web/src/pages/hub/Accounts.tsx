import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, Users } from "lucide-react"
import { useState } from "react"
import { Button, Dialog, EmptyState } from "@/components/ui"
import { api } from "@/lib/api"
import { toast } from "@/lib/toast"
import type { HubAccount, HubOverview } from "@/lib/types"
import { img } from "@/lib/utils"

// The AniList logins given to the server: each account's progress is kept
// apart, and the devices on it are kept in step with each other.

export default function Accounts({ o }: { o: HubOverview }) {
    const qc = useQueryClient()
    const [removing, setRemoving] = useState<HubAccount | null>(null)
    const remove = useMutation({
        mutationFn: (user: number) => api.del(`/api/hub/accounts/${user}`),
        onSuccess: () => {
            setRemoving(null)
            toast.success("Login removed")
            qc.invalidateQueries({ queryKey: ["hub", "overview"] })
        },
        onError: (e: Error) => toast.error(e.message),
    })
    // The devices on each account (as they last said), logged in on them or
    // with the login the server gives them.
    const devicesOf = (user: number) => o.devices.filter(d => d.user === user || (d.account && d.accountUser === user))
    return (
        <div className="flex flex-col gap-6">
            <p className="max-w-3xl text-sm leading-relaxed text-muted">
                Devices on the same AniList account share progress, list and theme. A login kept here can be given to devices that aren't logged in, under Devices › Give it an AniList login.
            </p>
            {o.accounts.length === 0 ? (
                <EmptyState icon={<Users />} title="No AniList login given to the server">
                    On a device logged in to AniList, open Settings › Other devices and choose Give the server my AniList login.
                </EmptyState>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {o.accounts.map(a => {
                        const devices = devicesOf(a.user)
                        return (
                            <li key={a.user} className="card flex flex-col gap-3 p-4">
                                <div className="flex items-center gap-3">
                                    {a.avatar ? <img src={img(a.avatar)} alt="" className="size-11 rounded-full object-cover" /> : <div className="size-11 rounded-full bg-surface-3" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{a.name}</p>
                                        <p className="truncate text-[12.5px] text-muted">
                                            Given by {a.givenBy || "a device"} · {new Date(a.addedAt * 1000).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(a)}>
                                        Remove
                                    </Button>
                                </div>
                                <p className="text-[12.5px] text-muted">
                                    {a.history.toLocaleString()} episode{a.history === 1 ? "" : "s"} with progress kept ·{" "}
                                    {devices.length === 0 ? "no device on it" : devices.map(d => d.name).join(", ")}
                                </p>
                            </li>
                        )
                    })}
                </ul>
            )}
            <Dialog
                open={!!removing}
                onOpenChange={v => !v && setRemoving(null)}
                title={`Remove ${removing?.name ?? ""}'s login?`}
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setRemoving(null)}>
                            Cancel
                        </Button>
                        <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.user)}>
                            Remove
                        </Button>
                    </>
                }
            >
                <p className="text-sm leading-relaxed text-muted">
                    Devices using this login from the server are logged out. The account's progress is kept.
                </p>
            </Dialog>
        </div>
    )
}
