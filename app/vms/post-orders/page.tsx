import { redirect } from "next/navigation"

// Post Orders now lives inside the Property Hub. Keep this route as a
// permanent redirect so old links / bookmarks land in the right place.
export default function PostOrdersRedirect() {
  redirect("/vms/property")
}
