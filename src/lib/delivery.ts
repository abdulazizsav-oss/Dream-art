export const DELIVERY_SERVICE_FEE = 50_000

export interface DeliveryServices {
  delivery_to_client: boolean
  delivery_from_client: boolean
}

export function calculateDeliveryFee(services: DeliveryServices): number {
  return (
    Number(services.delivery_to_client)
    + Number(services.delivery_from_client)
  ) * DELIVERY_SERVICE_FEE
}

export function deliveryServiceCount(services: DeliveryServices): number {
  return Number(services.delivery_to_client) + Number(services.delivery_from_client)
}
