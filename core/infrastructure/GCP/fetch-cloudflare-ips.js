export default async function fetchCloudflareIPs() {
  const [ipv4Res, ipv6Res] = await Promise.all([
    fetch("https://www.cloudflare.com/ips-v4"),
    fetch("https://www.cloudflare.com/ips-v6"),
  ])

  if (!ipv4Res.ok || !ipv6Res.ok) {
    throw new Error("Failed to fetch Cloudflare IP ranges")
  }

  const ipv4 = (await ipv4Res.text()).trim().split("\n")
  const ipv6 = (await ipv6Res.text()).trim().split("\n")

  return [...ipv4, ...ipv6]
}