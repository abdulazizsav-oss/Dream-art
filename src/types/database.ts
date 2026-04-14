export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      equipment_categories: {
        Row: { id: string; name: string; slug: string; created_at: string }
        Insert: { id?: string; name: string; slug: string; created_at?: string }
        Update: { id?: string; name?: string; slug?: string; created_at?: string }
      }
      equipment: {
        Row: {
          id: string; category_id: string | null; name: string; serial_number: string | null
          photo_url: string | null; purchase_cost: number | null; daily_rate: number
          status: 'free' | 'rented' | 'maintenance' | 'lost'; notes: string | null
          created_at: string; updated_at: string
        }
        Insert: {
          id?: string; category_id?: string | null; name: string; serial_number?: string | null
          photo_url?: string | null; purchase_cost?: number | null; daily_rate: number
          status?: 'free' | 'rented' | 'maintenance' | 'lost'; notes?: string | null
          created_at?: string; updated_at?: string
        }
        Update: {
          id?: string; category_id?: string | null; name?: string; serial_number?: string | null
          photo_url?: string | null; purchase_cost?: number | null; daily_rate?: number
          status?: 'free' | 'rented' | 'maintenance' | 'lost'; notes?: string | null
          updated_at?: string
        }
      }
      equipment_maintenance: {
        Row: {
          id: string; equipment_id: string; scheduled_date: string | null
          completed_date: string | null; description: string | null
          cost: number | null; created_at: string
        }
        Insert: {
          id?: string; equipment_id: string; scheduled_date?: string | null
          completed_date?: string | null; description?: string | null
          cost?: number | null; created_at?: string
        }
        Update: {
          id?: string; equipment_id?: string; scheduled_date?: string | null
          completed_date?: string | null; description?: string | null; cost?: number | null
        }
      }
      clients: {
        Row: {
          id: string; full_name: string; phone: string | null; telegram_username: string | null
          telegram_chat_id: number | null; passport_series: string | null
          passport_number: string | null; passport_issued_by: string | null
          passport_issued_date: string | null; deposit_held: number; reliability_rating: number
          segment: 'photographer' | 'videographer' | 'studio' | 'agency' | 'one_time' | 'other'
          notes: string | null; birth_date: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; full_name: string; phone?: string | null; telegram_username?: string | null
          telegram_chat_id?: number | null; passport_series?: string | null
          passport_number?: string | null; passport_issued_by?: string | null
          passport_issued_date?: string | null; deposit_held?: number; reliability_rating?: number
          segment?: 'photographer' | 'videographer' | 'studio' | 'agency' | 'one_time' | 'other'
          notes?: string | null; birth_date?: string | null
        }
        Update: {
          full_name?: string; phone?: string | null; telegram_username?: string | null
          telegram_chat_id?: number | null; passport_series?: string | null
          passport_number?: string | null; passport_issued_by?: string | null
          passport_issued_date?: string | null; deposit_held?: number; reliability_rating?: number
          segment?: 'photographer' | 'videographer' | 'studio' | 'agency' | 'one_time' | 'other'
          notes?: string | null; birth_date?: string | null
        }
      }
      orders: {
        Row: {
          id: string; order_number: string; client_id: string
          status: 'draft' | 'active' | 'returned' | 'overdue' | 'cancelled'
          start_date: string; end_date: string; total_amount: number; deposit_amount: number
          deposit_returned: boolean; contract_pdf_url: string | null; notes: string | null
          created_by: string | null; created_at: string; updated_at: string
        }
        Insert: {
          id?: string; order_number?: string; client_id: string
          status?: 'draft' | 'active' | 'returned' | 'overdue' | 'cancelled'
          start_date: string; end_date: string; total_amount?: number; deposit_amount?: number
          deposit_returned?: boolean; contract_pdf_url?: string | null; notes?: string | null
          created_by?: string | null
        }
        Update: {
          status?: 'draft' | 'active' | 'returned' | 'overdue' | 'cancelled'
          start_date?: string; end_date?: string; total_amount?: number; deposit_amount?: number
          deposit_returned?: boolean; contract_pdf_url?: string | null; notes?: string | null
        }
      }
      order_items: {
        Row: {
          id: string; order_id: string; equipment_id: string; daily_rate: number; days: number
          subtotal: number; condition_on_issue: string | null; condition_on_return: string | null
          issue_photo_urls: string[]; return_photo_urls: string[]
        }
        Insert: {
          id?: string; order_id: string; equipment_id: string; daily_rate: number; days: number
          subtotal: number; condition_on_issue?: string | null; condition_on_return?: string | null
          issue_photo_urls?: string[]; return_photo_urls?: string[]
        }
        Update: {
          condition_on_return?: string | null; return_photo_urls?: string[]
        }
      }
      payments: {
        Row: {
          id: string; order_id: string; amount: number
          payment_method: 'cash' | 'transfer' | 'card'
          payment_type: 'rental' | 'deposit' | 'deposit_return' | 'extra' | 'fine'
          paid_at: string; notes: string | null; created_by: string | null
        }
        Insert: {
          id?: string; order_id: string; amount: number
          payment_method?: 'cash' | 'transfer' | 'card'
          payment_type?: 'rental' | 'deposit' | 'deposit_return' | 'extra' | 'fine'
          paid_at?: string; notes?: string | null; created_by?: string | null
        }
        Update: { amount?: number; notes?: string | null }
      }
      blocked_dates: {
        Row: {
          id: string; equipment_id: string; start_date: string; end_date: string
          reason: string | null; created_at: string
        }
        Insert: {
          id?: string; equipment_id: string; start_date: string; end_date: string
          reason?: string | null
        }
        Update: { start_date?: string; end_date?: string; reason?: string | null }
      }
      notification_log: {
        Row: {
          id: string; order_id: string | null; client_id: string | null; type: string
          sent_at: string; telegram_message_id: number | null; success: boolean
        }
        Insert: {
          id?: string; order_id?: string | null; client_id?: string | null; type: string
          sent_at?: string; telegram_message_id?: number | null; success?: boolean
        }
        Update: { success?: boolean }
      }
    }
    Views: {
      v_equipment_utilization: {
        Row: {
          id: string; name: string; category_id: string | null; daily_rate: number
          purchase_cost: number | null; status: string; total_rentals: number
          total_rental_days: number; total_revenue: number; roi_percent: number
        }
      }
      v_overdue_orders: {
        Row: {
          id: string; order_number: string; client_id: string; status: string
          start_date: string; end_date: string; total_amount: number; client_name: string
          client_phone: string | null; telegram_chat_id: number | null; days_overdue: number
        }
      }
      v_dashboard_stats: {
        Row: {
          active_rentals: number; overdue_count: number; revenue_this_month: number
          revenue_this_week: number; equipment_free: number; equipment_rented: number
          equipment_maintenance: number; total_clients: number
        }
      }
    }
    Functions: {
      check_equipment_availability: {
        Args: { p_equipment_id: string; p_start_date: string; p_end_date: string; p_exclude_order_id?: string }
        Returns: boolean
      }
      create_order_atomic: {
        Args: {
          p_client_id: string; p_start_date: string; p_end_date: string
          p_deposit_amount: number; p_notes: string; p_created_by: string; p_items: Json
        }
        Returns: string
      }
      return_order_atomic: {
        Args: { p_order_id: string; p_items: Json }
        Returns: void
      }
    }
  }
}

// Convenience type aliases
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type EquipmentCategory = Tables<'equipment_categories'>
export type Equipment = Tables<'equipment'>
export type EquipmentMaintenance = Tables<'equipment_maintenance'>
export type Client = Tables<'clients'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type Payment = Tables<'payments'>
export type BlockedDate = Tables<'blocked_dates'>
