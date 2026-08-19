export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      articles: {
        Row: {
          author_id: string
          body: string
          cover_photo_r2_key: string | null
          created_at: string
          id: string
          published_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          cover_photo_r2_key?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          cover_photo_r2_key?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_item_checks: {
        Row: {
          board_id: string
          board_item_id: string
          checked_at: string
          user_id: string
        }
        Insert: {
          board_id: string
          board_item_id: string
          checked_at?: string
          user_id: string
        }
        Update: {
          board_id?: string
          board_item_id?: string
          checked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_item_checks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_item_checks_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_item_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_items: {
        Row: {
          added_at: string
          board_id: string
          id: string
          item_type: string
          note: string | null
          photo_id: string | null
          place_id: string | null
          position: number
          visit_id: string | null
        }
        Insert: {
          added_at?: string
          board_id: string
          id?: string
          item_type: string
          note?: string | null
          photo_id?: string | null
          place_id?: string | null
          position?: number
          visit_id?: string | null
        }
        Update: {
          added_at?: string
          board_id?: string
          id?: string
          item_type?: string
          note?: string | null
          photo_id?: string | null
          place_id?: string | null
          position?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          cover_photo_id: string | null
          cover_photo_r2_key: string | null
          cover_r2_key: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          is_private: boolean
          list_style: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          is_private?: boolean
          list_style?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          is_private?: boolean
          list_style?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          user_id: string
          visit_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          user_id: string
          visit_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_visits: {
        Row: {
          created_at: string
          id: string
          note: string | null
          place_id: string | null
          rating: number | null
          updated_at: string
          user_id: string
          visited_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string | null
          rating?: number | null
          updated_at?: string
          user_id: string
          visited_on: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string | null
          rating?: number | null
          updated_at?: string
          user_id?: string
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          status: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          status?: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      home_locations: {
        Row: {
          created_at: string
          id: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_locations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          board_id: string | null
          board_item_id: string | null
          created_at: string
          digest_place_ids: string[] | null
          digest_review_count: number | null
          id: string
          is_read: boolean
          recipient_id: string
          travel_book_id: string | null
          travel_book_item_id: string | null
          type: string
          visit_id: string | null
        }
        Insert: {
          actor_id?: string | null
          board_id?: string | null
          board_item_id?: string | null
          created_at?: string
          digest_place_ids?: string[] | null
          digest_review_count?: number | null
          id?: string
          is_read?: boolean
          recipient_id: string
          travel_book_id?: string | null
          travel_book_item_id?: string | null
          type: string
          visit_id?: string | null
        }
        Update: {
          actor_id?: string | null
          board_id?: string | null
          board_item_id?: string | null
          created_at?: string
          digest_place_ids?: string[] | null
          digest_review_count?: number | null
          id?: string
          is_read?: boolean
          recipient_id?: string
          travel_book_id?: string | null
          travel_book_item_id?: string | null
          type?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_board_item_id_fkey"
            columns: ["board_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_travel_book_item_id_fkey"
            columns: ["travel_book_item_id"]
            isOneToOne: false
            referencedRelation: "travel_book_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          draft_visit_id: string | null
          height: number | null
          id: string
          position: number
          r2_key: string
          visit_id: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          draft_visit_id?: string | null
          height?: number | null
          id?: string
          position?: number
          r2_key: string
          visit_id?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          draft_visit_id?: string | null
          height?: number | null
          id?: string
          position?: number
          r2_key?: string
          visit_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_draft_visit_id_fkey"
            columns: ["draft_visit_id"]
            isOneToOne: false
            referencedRelation: "draft_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          boundary_geometry: unknown
          cached_at: string
          category: string | null
          geog: unknown
          google_place_id: string | null
          id: string
          lat: number | null
          level: string
          lng: number | null
          name: string
          osm_id: string | null
          parent_id: string | null
          source: string
        }
        Insert: {
          boundary_geometry?: unknown
          cached_at?: string
          category?: string | null
          geog?: unknown
          google_place_id?: string | null
          id?: string
          lat?: number | null
          level: string
          lng?: number | null
          name: string
          osm_id?: string | null
          parent_id?: string | null
          source: string
        }
        Update: {
          boundary_geometry?: unknown
          cached_at?: string
          category?: string | null
          geog?: unknown
          google_place_id?: string | null
          id?: string
          lat?: number | null
          level?: string
          lng?: number | null
          name?: string
          osm_id?: string | null
          parent_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompt_attachments: {
        Row: {
          attachment_type: string
          board_id: string | null
          cover_photo_id: string | null
          created_at: string
          display_mode: string | null
          grid_photo_ids: string[] | null
          id: string
          photo_r2_key: string | null
          place_id: string | null
          position: number
          prompt_id: string
          show_note: boolean
          show_rating_stamp: boolean
          text_value: string | null
          travel_book_id: string | null
          visit_id: string | null
          visit_photo_id: string | null
        }
        Insert: {
          attachment_type: string
          board_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          display_mode?: string | null
          grid_photo_ids?: string[] | null
          id?: string
          photo_r2_key?: string | null
          place_id?: string | null
          position?: number
          prompt_id: string
          show_note?: boolean
          show_rating_stamp?: boolean
          text_value?: string | null
          travel_book_id?: string | null
          visit_id?: string | null
          visit_photo_id?: string | null
        }
        Update: {
          attachment_type?: string
          board_id?: string | null
          cover_photo_id?: string | null
          created_at?: string
          display_mode?: string | null
          grid_photo_ids?: string[] | null
          id?: string
          photo_r2_key?: string | null
          place_id?: string | null
          position?: number
          prompt_id?: string
          show_note?: boolean
          show_rating_stamp?: boolean
          text_value?: string | null
          travel_book_id?: string | null
          visit_id?: string | null
          visit_photo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompt_attachments_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "profile_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_prompt_attachments_visit_photo_id_fkey"
            columns: ["visit_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_prompts: {
        Row: {
          created_at: string
          id: string
          position: number
          prompt_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          prompt_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          prompt_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_prompts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          snapshot_author_name: string | null
          snapshot_note: string | null
          snapshot_place_name: string | null
          snapshot_rating: number | null
          status: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          snapshot_author_name?: string | null
          snapshot_note?: string | null
          snapshot_place_name?: string | null
          snapshot_rating?: number | null
          status?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          snapshot_author_name?: string | null
          snapshot_note?: string | null
          snapshot_place_name?: string | null
          snapshot_rating?: number | null
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_boards: {
        Row: {
          board_id: string
          created_at: string
          notify_on_new_items: boolean
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          notify_on_new_items?: boolean
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          notify_on_new_items?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_boards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_boards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_travel_books: {
        Row: {
          created_at: string
          notify_on_new_items: boolean
          travel_book_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_on_new_items?: boolean
          travel_book_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_on_new_items?: boolean
          travel_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_travel_books_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_travel_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      travel_book_collaborators: {
        Row: {
          added_at: string
          travel_book_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          travel_book_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          travel_book_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_collaborators_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_item_checks: {
        Row: {
          checked_at: string
          travel_book_id: string
          travel_book_item_id: string
          user_id: string
        }
        Insert: {
          checked_at?: string
          travel_book_id: string
          travel_book_item_id: string
          user_id: string
        }
        Update: {
          checked_at?: string
          travel_book_id?: string
          travel_book_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_item_checks_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_item_checks_travel_book_item_id_fkey"
            columns: ["travel_book_item_id"]
            isOneToOne: false
            referencedRelation: "travel_book_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_item_checks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_items: {
        Row: {
          added_at: string
          added_by: string
          id: string
          item_type: string
          place_id: string | null
          travel_book_id: string
          visit_id: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          id?: string
          item_type?: string
          place_id?: string | null
          travel_book_id: string
          visit_id?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          item_type?: string
          place_id?: string | null
          travel_book_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_book_recaps: {
        Row: {
          author_id: string
          body: string | null
          cover_r2_key: string | null
          created_at: string
          id: string
          is_published: boolean
          published_at: string | null
          rating: number | null
          title: string
          travel_book_id: string
        }
        Insert: {
          author_id: string
          body?: string | null
          cover_r2_key?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating?: number | null
          title: string
          travel_book_id: string
        }
        Update: {
          author_id?: string
          body?: string | null
          cover_r2_key?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          published_at?: string | null
          rating?: number | null
          title?: string
          travel_book_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_book_recaps_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_book_recaps_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_books: {
        Row: {
          cover_photo_id: string | null
          cover_photo_r2_key: string | null
          cover_r2_key: string | null
          created_at: string
          description: string | null
          id: string
          is_private: boolean
          location_place_id: string | null
          rating: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          location_place_id?: string | null
          rating?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_photo_id?: string | null
          cover_photo_r2_key?: string | null
          cover_r2_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean
          location_place_id?: string | null
          rating?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_books_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_books_location_place_id_fkey"
            columns: ["location_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_overrides: {
        Row: {
          dismissed: boolean
          display_place_id: string | null
          home_prompt_dismissed: boolean
          start_date: string
          travel_book_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dismissed?: boolean
          display_place_id?: string | null
          home_prompt_dismissed?: boolean
          start_date: string
          travel_book_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dismissed?: boolean
          display_place_id?: string | null
          home_prompt_dismissed?: boolean
          start_date?: string
          travel_book_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_overrides_display_place_id_fkey"
            columns: ["display_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_overrides_travel_book_id_fkey"
            columns: ["travel_book_id"]
            isOneToOne: false
            referencedRelation: "travel_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_r2_key: string | null
          bio: string | null
          birthdate: string | null
          created_at: string
          discoverable_by_contacts: boolean
          feed_last_viewed_at: string | null
          handle: string | null
          has_set_demographics: boolean
          has_set_privacy: boolean
          has_shared_invite: boolean
          hashed_phone: string | null
          home_place_id: string | null
          id: string
          invite_exempt: boolean
          is_admin: boolean
          is_private: boolean
          last_nearby_digest_at: string
          map_default_center_lat: number | null
          map_default_center_lng: number | null
          map_default_layers: string[]
          map_default_zoom: number | null
          name: string | null
          notify_comments: boolean
          notify_follows: boolean
          notify_friend_activity: boolean
          notify_likes: boolean
          notify_nearby_reviews: boolean
          notify_saves: boolean
          profile_section_order: string[] | null
          show_map: boolean
        }
        Insert: {
          avatar_r2_key?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          discoverable_by_contacts?: boolean
          feed_last_viewed_at?: string | null
          handle?: string | null
          has_set_demographics?: boolean
          has_set_privacy?: boolean
          has_shared_invite?: boolean
          hashed_phone?: string | null
          home_place_id?: string | null
          id: string
          invite_exempt?: boolean
          is_admin?: boolean
          is_private?: boolean
          last_nearby_digest_at?: string
          map_default_center_lat?: number | null
          map_default_center_lng?: number | null
          map_default_layers?: string[]
          map_default_zoom?: number | null
          name?: string | null
          notify_comments?: boolean
          notify_follows?: boolean
          notify_friend_activity?: boolean
          notify_likes?: boolean
          notify_nearby_reviews?: boolean
          notify_saves?: boolean
          profile_section_order?: string[] | null
          show_map?: boolean
        }
        Update: {
          avatar_r2_key?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string
          discoverable_by_contacts?: boolean
          feed_last_viewed_at?: string | null
          handle?: string | null
          has_set_demographics?: boolean
          has_set_privacy?: boolean
          has_shared_invite?: boolean
          hashed_phone?: string | null
          home_place_id?: string | null
          id?: string
          invite_exempt?: boolean
          is_admin?: boolean
          is_private?: boolean
          last_nearby_digest_at?: string
          map_default_center_lat?: number | null
          map_default_center_lng?: number | null
          map_default_layers?: string[]
          map_default_zoom?: number | null
          name?: string | null
          notify_comments?: boolean
          notify_follows?: boolean
          notify_friend_activity?: boolean
          notify_likes?: boolean
          notify_nearby_reviews?: boolean
          notify_saves?: boolean
          profile_section_order?: string[] | null
          show_map?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "users_home_place_id_fkey"
            columns: ["home_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_tagged_places: {
        Row: {
          place_id: string
          visit_id: string
        }
        Insert: {
          place_id: string
          visit_id: string
        }
        Update: {
          place_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tagged_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tagged_places_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_tagged_users: {
        Row: {
          created_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tagged_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tagged_users_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          created_at: string
          id: string
          note: string | null
          place_id: string
          rating: number | null
          user_id: string
          visited_on: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          place_id: string
          rating?: number | null
          user_id: string
          visited_on: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          place_id?: string
          rating?: number | null
          user_id?: string
          visited_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      can_view_user_content: {
        Args: { owner_id: string; viewer_id: string }
        Returns: boolean
      }
      deepest_common_area: { Args: { p_ids: string[] }; Returns: string }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_collection_stats: {
        Args: { board_ids?: string[]; travel_book_ids?: string[] }
        Returns: {
          avg_rating: number
          collection_id: string
          collection_type: string
          save_count: number
        }[]
      }
      get_nearby_reviewed_places: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
        }
        Returns: {
          avg_rating: number
          lat: number
          lng: number
          name: string
          place_id: string
          review_count: number
        }[]
      }
      get_place_aggregate_rating: {
        Args: { target_place_id: string }
        Returns: {
          avg_rating: number
          review_count: number
        }[]
      }
      get_place_ancestry: {
        Args: { p_id: string }
        Returns: {
          depth: number
          id: string
          level: string
          name: string
        }[]
      }
      get_popular_places: {
        Args: { result_limit?: number }
        Returns: {
          avg_rating: number
          lat: number
          lng: number
          name: string
          place_id: string
          review_count: number
        }[]
      }
      get_trips_for_users: {
        Args: { user_ids: string[] }
        Returns: {
          area_lat: number
          area_level: string
          area_lng: number
          area_name: string
          area_place_id: string
          auto_area_place_id: string
          end_date: string
          is_ongoing: boolean
          kind: string
          start_date: string
          travel_book_id: string
          trip_key: string
          user_id: string
          visit_ids: string[]
        }[]
      }
      get_visited_regions: {
        Args: { profile_user_id: string }
        Returns: {
          boundary_geojson: string
          id: string
          level: string
          name: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      is_blocked: { Args: { user_a: string; user_b: string }; Returns: boolean }
      is_travel_book_participant: {
        Args: { book_id: string; uid: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      majority_area: { Args: { p_ids: string[] }; Returns: string }
      match_contacts_by_hash: {
        Args: { hashes: string[] }
        Returns: {
          handle: string
          hashed_phone: string
          id: string
          is_private: boolean
          name: string
        }[]
      }
      place_has_ancestor: {
        Args: { anc_id: string; p_id: string }
        Returns: boolean
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      publish_draft: { Args: { draft_id: string }; Returns: string }
      resolve_state_countries: {
        Args: { place_ids: string[] }
        Returns: {
          country_name: string
          place_id: string
          state_name: string
        }[]
      }
      run_nearby_review_digest: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      store_place_boundary: {
        Args: { geojson: Json; place_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upgrade_place_details: {
        Args: {
          p_category: string
          p_google_place_id: string
          p_lat: number
          p_lng: number
          place_id: string
        }
        Returns: {
          boundary_geometry: unknown
          cached_at: string
          category: string | null
          geog: unknown
          google_place_id: string | null
          id: string
          lat: number | null
          level: string
          lng: number | null
          name: string
          osm_id: string | null
          parent_id: string | null
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "places"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
