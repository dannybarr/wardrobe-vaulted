const clientToken = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="payment-banner payment-banner--error">
        Live checkout isn't configured yet — finish go-live to take real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="payment-banner">
        Payments in the preview are in test mode — no money moves.
      </div>
    );
  }
  return null;
}
