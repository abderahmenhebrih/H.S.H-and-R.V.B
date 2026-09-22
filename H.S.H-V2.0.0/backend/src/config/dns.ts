import dns from "node:dns";

// Optional per-installation workaround for broken SRV resolution. With no
// override, preserve the operating system's DNS settings.
export function configureDatabaseDns(): void {
  const configured = process.env.MONGODB_DNS_SERVERS?.trim();
  if (!configured) return;

  const servers = configured.split(",").map((server) => server.trim());
  if (servers.some((server) => !server)) {
    throw new Error("MONGODB_DNS_SERVERS contains an empty DNS server.");
  }
  try {
    dns.setServers(servers);
  } catch {
    throw new Error("MONGODB_DNS_SERVERS must contain valid DNS server IP addresses.");
  }
}
