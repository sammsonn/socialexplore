"""Add friend_request_id to read_notifications and make activity_id nullable

Revision ID: 003_friend_notifications
Revises: 002_read_notifications
Create Date: 2024-12-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003_friend_notifications'
down_revision = '002_read_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verifică dacă tabelul există
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'read_notifications' in tables:
        # Verifică dacă coloana friend_request_id există deja
        columns = [col['name'] for col in inspector.get_columns('read_notifications')]
        
        # Face activity_id nullable
        if 'activity_id' in columns:
            # Verifică dacă este deja nullable
            activity_id_col = next(col for col in inspector.get_columns('read_notifications') if col['name'] == 'activity_id')
            if activity_id_col['nullable'] is False:
                op.alter_column('read_notifications', 'activity_id', nullable=True)
        
        # Adaugă friend_request_id dacă nu există
        if 'friend_request_id' not in columns:
            op.add_column('read_notifications', 
                sa.Column('friend_request_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_read_notifications_friend_request_id',
                'read_notifications', 'friend_requests',
                ['friend_request_id'], ['id']
            )


def downgrade() -> None:
    # Elimină friend_request_id
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'read_notifications' in tables:
        columns = [col['name'] for col in inspector.get_columns('read_notifications')]
        
        if 'friend_request_id' in columns:
            op.drop_constraint('fk_read_notifications_friend_request_id', 'read_notifications', type_='foreignkey')
            op.drop_column('read_notifications', 'friend_request_id')
        
        # Face activity_id NOT NULL din nou (dacă vrei să revii la versiunea anterioară)
        # op.alter_column('read_notifications', 'activity_id', nullable=False)

