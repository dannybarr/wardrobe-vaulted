/** Leaves the read-only demo and opens account creation. Nothing is written here. */
export function askToSignUp(): void {
  window.location.assign("/auth?mode=signup&redirect=/demo");
}
