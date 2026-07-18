export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type EquipmentStatus = 'free' | 'rented' | 'maintenance' | 'lost'
export type OrderStatus = 'draft' | 'active' | 'returned' | 'overdue' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer' | 'card'
export type PaymentType = 'rental' | 'deposit' | 'deposit_return' | 'extra' | 'fine'
export type ClientSegment = 'photographer' | 'videographer' | 'studio' | 'agency' | 'one_time' | 'other'
export type DocumentType = 'passport_id' | 'passport_green' | 'zagranpassport' | 'passport_cover' | 'drivers_license'
export type UserRole = 'admin' | 'super_admin'
export type CurrencyCode = 'UZS' | 'USD'
export type ShiftType = 'day' | 'night'
export type RateSource = 'auto' | 'manual'
export type FulfillmentMethod = 'pickup' | 'delivery'

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          full_name: string
          role: UserRole
          nickname: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          role?: UserRole
          nickname: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          role?: UserRole
          nickname?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      brands: {
        Row: { id: string; name: string; logo_url: string | null; sort_order: number; created_at: string }
        Insert: { id?: string; name: string; logo_url?: string | null; sort_order?: number }
        Update: { name?: string; logo_url?: string | null; sort_order?: number }
        Relationships: []
      }
      equipment_categories: {
        Row: {
          id: string
          name: string
          slug: string
          cover_url: string | null
          photo_url: string | null
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          cover_url?: string | null
          photo_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          cover_url?: string | null
          photo_url?: string | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          id: string
          category_id: string | null
          brand_id: string | null
          name: string
          serial_number: string | null
          photo_url: string | null
          purchase_cost: number | null
          daily_rate: number
          day_rate: number
          night_rate: number
          currency: CurrencyCode
          brand: string | null
          specs: string | null
          status: EquipmentStatus
          notes: string | null
          source: string | null
          sort_order: number
          kit_items: string[]
          kit: Json
          day_night: 'day' | 'night' | 'both'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id?: string | null
          brand_id?: string | null
          name: string
          serial_number?: string | null
          photo_url?: string | null
          purchase_cost?: number | null
          daily_rate: number
          day_rate?: number
          night_rate?: number
          currency?: CurrencyCode
          brand?: string | null
          specs?: string | null
          status?: EquipmentStatus
          notes?: string | null
          source?: string | null
          sort_order?: number
          kit_items?: string[]
          kit?: Json
          day_night?: 'day' | 'night' | 'both'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string | null
          brand_id?: string | null
          name?: string
          serial_number?: string | null
          photo_url?: string | null
          purchase_cost?: number | null
          daily_rate?: number
          day_rate?: number
          night_rate?: number
          currency?: CurrencyCode
          brand?: string | null
          specs?: string | null
          status?: EquipmentStatus
          notes?: string | null
          source?: string | null
          sort_order?: number
          kit_items?: string[]
          kit?: Json
          day_night?: 'day' | 'night' | 'both'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'equipment_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'equipment_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'equipment_brand_id_fkey'
            columns: ['brand_id']
            isOneToOne: false
            referencedRelation: 'brands'
            referencedColumns: ['id']
          },
        ]
      }
      equipment_maintenance: {
        Row: {
          id: string
          equipment_id: string
          scheduled_date: string | null
          completed_date: string | null
          description: string | null
          cost: number | null
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          scheduled_date?: string | null
          completed_date?: string | null
          description?: string | null
          cost?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          scheduled_date?: string | null
          completed_date?: string | null
          description?: string | null
          cost?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'equipment_maintenance_equipment_id_fkey'
            columns: ['equipment_id']
            isOneToOne: false
            referencedRelation: 'equipment'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          id: string
          category: 'maintenance' | 'purchase' | 'salary' | 'rent' | 'tax' | 'marketing' | 'transport' | 'other'
          description: string
          amount: number
          currency: 'UZS'
          expense_date: string
          payment_method: PaymentMethod
          equipment_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category: 'maintenance' | 'purchase' | 'salary' | 'rent' | 'tax' | 'marketing' | 'transport' | 'other'
          description?: string
          amount: number
          currency?: 'UZS'
          expense_date?: string
          payment_method?: PaymentMethod
          equipment_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category?: 'maintenance' | 'purchase' | 'salary' | 'rent' | 'tax' | 'marketing' | 'transport' | 'other'
          description?: string
          amount?: number
          currency?: 'UZS'
          expense_date?: string
          payment_method?: PaymentMethod
          equipment_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_equipment_id_fkey'
            columns: ['equipment_id']
            isOneToOne: false
            referencedRelation: 'equipment'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_created_by_profile_fk'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      clients: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          email: string | null
          telegram_username: string | null
          telegram_chat_id: number | null
          instagram_username: string | null
          facebook_username: string | null
          address_actual: string | null
          address_registered: string | null
          photo_url: string | null
          passport_series: string | null
          passport_number: string | null
          passport_issued_by: string | null
          passport_issued_date: string | null
          deposit_held: number
          reliability_rating: number
          segment: ClientSegment
          document_type: DocumentType
          notes: string | null
          birth_date: string | null
          trusted_person_name: string | null
          trusted_person_phone: string | null
          trusted_person_relation: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          phone?: string | null
          email?: string | null
          telegram_username?: string | null
          telegram_chat_id?: number | null
          instagram_username?: string | null
          facebook_username?: string | null
          address_actual?: string | null
          address_registered?: string | null
          photo_url?: string | null
          passport_series?: string | null
          passport_number?: string | null
          passport_issued_by?: string | null
          passport_issued_date?: string | null
          deposit_held?: number
          reliability_rating?: number
          segment?: ClientSegment
          document_type?: DocumentType
          notes?: string | null
          birth_date?: string | null
          trusted_person_name?: string | null
          trusted_person_phone?: string | null
          trusted_person_relation?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          telegram_username?: string | null
          telegram_chat_id?: number | null
          instagram_username?: string | null
          facebook_username?: string | null
          address_actual?: string | null
          address_registered?: string | null
          photo_url?: string | null
          passport_series?: string | null
          passport_number?: string | null
          passport_issued_by?: string | null
          passport_issued_date?: string | null
          deposit_held?: number
          reliability_rating?: number
          segment?: ClientSegment
          document_type?: DocumentType
          notes?: string | null
          birth_date?: string | null
          trusted_person_name?: string | null
          trusted_person_phone?: string | null
          trusted_person_relation?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clients_created_by_profile_fk'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          id: string
          order_number: string
          client_id: string
          status: OrderStatus
          start_date: string
          end_date: string
          start_time: string
          end_time: string
          actual_return_date: string | null
          actual_start_at: string | null
          actual_end_at: string | null
          total_amount: number
          deposit_amount: number
          deposit_returned: boolean
          contract_pdf_url: string | null
          notes: string | null
          trusted_person: string | null
          trusted_person_doc_type: string | null
          fulfillment_method: FulfillmentMethod
          delivery_address: string | null
          delivery_fee: number
          delivery_to_client: boolean
          delivery_from_client: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_number?: string
          client_id: string
          status?: OrderStatus
          start_date: string
          end_date: string
          start_time?: string
          end_time?: string
          actual_return_date?: string | null
          actual_start_at?: string | null
          actual_end_at?: string | null
          total_amount?: number
          deposit_amount?: number
          deposit_returned?: boolean
          contract_pdf_url?: string | null
          notes?: string | null
          trusted_person?: string | null
          trusted_person_doc_type?: string | null
          fulfillment_method?: FulfillmentMethod
          delivery_address?: string | null
          delivery_fee?: number
          delivery_to_client?: boolean
          delivery_from_client?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_number?: string
          client_id?: string
          status?: OrderStatus
          start_date?: string
          end_date?: string
          start_time?: string
          end_time?: string
          actual_return_date?: string | null
          actual_start_at?: string | null
          actual_end_at?: string | null
          total_amount?: number
          deposit_amount?: number
          deposit_returned?: boolean
          contract_pdf_url?: string | null
          notes?: string | null
          trusted_person?: string | null
          trusted_person_doc_type?: string | null
          fulfillment_method?: FulfillmentMethod
          delivery_address?: string | null
          delivery_fee?: number
          delivery_to_client?: boolean
          delivery_from_client?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          equipment_id: string
          daily_rate: number
          day_rate_snapshot: number
          night_rate_snapshot: number
          day_units: number
          night_units: number
          days: number
          subtotal: number
          manual_subtotal: number | null
          kit_selection: Json
          shift_type: ShiftType
          rate_source: RateSource
          condition_on_issue: string | null
          condition_on_return: string | null
          issue_photo_urls: string[]
          return_photo_urls: string[]
          selected_kit_items: string[]
          returned_kit_items: string[]
          missing_kit_items: string[]
          actual_start_at: string | null
          actual_end_at: string | null
          final_subtotal: number | null
          final_day_units: number | null
          final_night_units: number | null
          returned: boolean
        }
        Insert: {
          id?: string
          order_id: string
          equipment_id: string
          daily_rate: number
          day_rate_snapshot?: number
          night_rate_snapshot?: number
          day_units?: number
          night_units?: number
          days: number
          subtotal: number
          manual_subtotal?: number | null
          kit_selection?: Json
          shift_type?: ShiftType
          rate_source?: RateSource
          condition_on_issue?: string | null
          condition_on_return?: string | null
          issue_photo_urls?: string[]
          return_photo_urls?: string[]
          selected_kit_items?: string[]
          returned_kit_items?: string[]
          missing_kit_items?: string[]
          actual_start_at?: string | null
          actual_end_at?: string | null
          final_subtotal?: number | null
          final_day_units?: number | null
          final_night_units?: number | null
          returned?: boolean
        }
        Update: {
          id?: string
          order_id?: string
          equipment_id?: string
          daily_rate?: number
          day_rate_snapshot?: number
          night_rate_snapshot?: number
          day_units?: number
          night_units?: number
          days?: number
          subtotal?: number
          manual_subtotal?: number | null
          kit_selection?: Json
          shift_type?: ShiftType
          rate_source?: RateSource
          condition_on_issue?: string | null
          condition_on_return?: string | null
          issue_photo_urls?: string[]
          return_photo_urls?: string[]
          selected_kit_items?: string[]
          returned_kit_items?: string[]
          missing_kit_items?: string[]
          actual_start_at?: string | null
          actual_end_at?: string | null
          final_subtotal?: number | null
          final_day_units?: number | null
          final_night_units?: number | null
          returned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_equipment_id_fkey'
            columns: ['equipment_id']
            isOneToOne: false
            referencedRelation: 'equipment'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          order_id: string
          amount: number
          payment_method: PaymentMethod
          payment_type: PaymentType
          paid_at: string
          notes: string | null
          created_by: string | null
          payment_group_id: string | null
        }
        Insert: {
          id?: string
          order_id: string
          amount: number
          payment_method?: PaymentMethod
          payment_type?: PaymentType
          paid_at?: string
          notes?: string | null
          created_by?: string | null
          payment_group_id?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          amount?: number
          payment_method?: PaymentMethod
          payment_type?: PaymentType
          paid_at?: string
          notes?: string | null
          created_by?: string | null
          payment_group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'payments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'user_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
      order_item_payment_allocations: {
        Row: {
          id: string
          order_item_id: string
          payment_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          order_item_id: string
          payment_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          order_item_id?: string
          payment_id?: string
          amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'order_item_payment_allocations_order_item_id_fkey'
            columns: ['order_item_id']
            isOneToOne: false
            referencedRelation: 'order_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_item_payment_allocations_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
        ]
      }
      order_delivery_payment_allocations: {
        Row: {
          id: string
          order_id: string
          payment_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          payment_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          payment_id?: string
          amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'order_delivery_payment_allocations_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_delivery_payment_allocations_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: true
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
        ]
      }
      order_item_missing_kit_events: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          kit_name: string
          missing_since: string
          returned_at: string | null
          marked_missing_by: string | null
          marked_returned_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          order_item_id: string
          kit_name: string
          missing_since?: string
          returned_at?: string | null
          marked_missing_by?: string | null
          marked_returned_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          order_item_id?: string
          kit_name?: string
          missing_since?: string
          returned_at?: string | null
          marked_missing_by?: string | null
          marked_returned_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'order_item_missing_kit_events_marked_missing_by_fkey'
            columns: ['marked_missing_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_item_missing_kit_events_marked_returned_by_fkey'
            columns: ['marked_returned_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_item_missing_kit_events_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_item_missing_kit_events_order_item_id_fkey'
            columns: ['order_item_id']
            isOneToOne: false
            referencedRelation: 'order_items'
            referencedColumns: ['id']
          },
        ]
      }
      blocked_dates: {
        Row: {
          id: string
          equipment_id: string
          start_date: string
          end_date: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          equipment_id: string
          start_date: string
          end_date: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          equipment_id?: string
          start_date?: string
          end_date?: string
          reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'blocked_dates_equipment_id_fkey'
            columns: ['equipment_id']
            isOneToOne: false
            referencedRelation: 'equipment'
            referencedColumns: ['id']
          },
        ]
      }
      notification_log: {
        Row: {
          id: string
          order_id: string | null
          client_id: string | null
          type: string
          sent_at: string
          telegram_message_id: number | null
          success: boolean
        }
        Insert: {
          id?: string
          order_id?: string | null
          client_id?: string | null
          type: string
          sent_at?: string
          telegram_message_id?: number | null
          success?: boolean
        }
        Update: {
          id?: string
          order_id?: string | null
          client_id?: string | null
          type?: string
          sent_at?: string
          telegram_message_id?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'notification_log_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notification_log_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_equipment_utilization: {
        Row: {
          id: string
          name: string
          category_id: string | null
          daily_rate: number
          purchase_cost: number | null
          status: string
          total_rentals: number
          total_rental_days: number
          total_revenue: number
          roi_percent: number
          currency: CurrencyCode
        }
        Relationships: []
      }
      v_overdue_orders: {
        Row: {
          id: string
          order_number: string
          client_id: string
          status: string
          start_date: string
          end_date: string
          total_amount: number
          client_name: string
          client_phone: string | null
          telegram_chat_id: number | null
          days_overdue: number
        }
        Relationships: []
      }
      v_dashboard_stats: {
        Row: {
          active_rentals: number
          overdue_count: number
          revenue_today: number
          revenue_this_month: number
          revenue_this_week: number
          equipment_free: number
          equipment_rented: number
          equipment_maintenance: number
          total_clients: number
        }
        Relationships: []
      }
    }
    Functions: {
      check_equipment_availability: {
        Args: {
          p_equipment_id: string
          p_start_date: string
          p_end_date: string
          p_exclude_order_id?: string | null
        }
        Returns: boolean
      }
      check_equipment_availability_tr: {
        Args: {
          p_equipment_id: string
          p_start_date: string
          p_start_time: string
          p_end_date: string
          p_end_time: string
          p_exclude_order_id?: string | null
        }
        Returns: boolean
      }
      create_order_atomic: {
        Args: {
          p_client_id: string
          p_start_date: string
          p_end_date: string
          p_start_time?: string
          p_end_time?: string
          p_deposit_amount: number
          p_notes: string
          p_created_by: string
          p_items: Json
        }
        Returns: string
      }
      create_order_atomic_v2: {
        Args: {
          p_client_id: string
          p_start_date: string
          p_end_date: string
          p_start_time: string
          p_end_time: string
          p_deposit_amount: number
          p_notes: string
          p_created_by: string
          p_items: Json
          p_fulfillment_method?: string
          p_delivery_address?: string | null
          p_delivery_fee?: number
        }
        Returns: string
      }
      create_order_atomic_v3: {
        Args: {
          p_client_id: string
          p_start_date: string
          p_end_date: string
          p_start_time: string
          p_end_time: string
          p_deposit_amount: number
          p_notes: string
          p_created_by: string
          p_items: Json
          p_delivery_to_client?: boolean
          p_delivery_from_client?: boolean
        }
        Returns: string
      }
      return_order_atomic: {
        Args: { p_order_id: string; p_items: Json; p_actual_return_date?: string | null }
        Returns: void
      }
      return_order_items_atomic: {
        Args: { p_order_id: string; p_items: Json }
        Returns: void
      }
      return_order_items_with_payments_atomic: {
        Args: {
          p_order_id: string
          p_items: Json
          p_payment_splits?: Json
          p_created_by?: string | null
          p_notes?: string | null
          p_actual_end_at?: string | null
        }
        Returns: Json
      }
      return_order_items_with_payments_atomic_v2: {
        Args: {
          p_order_id: string
          p_items: Json
          p_payment_splits?: Json
          p_created_by?: string | null
          p_notes?: string | null
          p_actual_end_at?: string | null
        }
        Returns: Json
      }
      return_order_items_with_payments_atomic_v3: {
        Args: {
          p_order_id: string
          p_items: Json
          p_payment_splits?: Json
          p_created_by?: string | null
          p_notes?: string | null
          p_actual_end_at?: string | null
          p_delivery_to_client?: boolean
          p_delivery_from_client?: boolean
        }
        Returns: Json
      }
      return_missing_kit_events_atomic: {
        Args: {
          p_order_id: string
          p_items: Json
          p_marked_returned_by?: string | null
          p_returned_at?: string | null
        }
        Returns: Json
      }
      pay_order_item_atomic: {
        Args: {
          p_order_id: string
          p_order_item_id: string
          p_payment_splits: Json
          p_created_by?: string | null
          p_notes?: string | null
        }
        Returns: Json
      }
      add_order_payment_with_allocations_atomic: {
        Args: {
          p_order_id: string
          p_payment_type: string
          p_splits: Json
          p_created_by?: string | null
          p_notes?: string | null
        }
        Returns: Json
      }
      add_order_payment_with_allocations_atomic_v2: {
        Args: {
          p_order_id: string
          p_payment_type: string
          p_splits: Json
          p_created_by?: string | null
          p_notes?: string | null
        }
        Returns: Json
      }
      update_order_delivery_atomic: {
        Args: {
          p_order_id: string
          p_fulfillment_method: string
          p_delivery_address: string | null
          p_delivery_fee: number
        }
        Returns: Json
      }
      update_order_item_kit_atomic: {
        Args: {
          p_order_id: string
          p_order_item_id: string
          p_kit_selection: Json
          p_selected_kit_items: string[]
        }
        Returns: Json
      }
      get_finance_analytics: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      add_order_items_atomic: {
        Args: { p_order_id: string; p_items: Json; p_added_by: string }
        Returns: string[]
      }
      mark_overdue_orders: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
    }
    Enums: Record<PropertyKey, never>
    CompositeTypes: Record<PropertyKey, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type EquipmentCategory = Tables<'equipment_categories'>
export type Equipment = Tables<'equipment'>
export type EquipmentMaintenance = Tables<'equipment_maintenance'>
export type Expense = Tables<'expenses'>
export type Client = Tables<'clients'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type Payment = Tables<'payments'>
export type OrderItemPaymentAllocation = Tables<'order_item_payment_allocations'>
export type OrderDeliveryPaymentAllocation = Tables<'order_delivery_payment_allocations'>
export type BlockedDate = Tables<'blocked_dates'>
export type UserProfile = Tables<'user_profiles'>
