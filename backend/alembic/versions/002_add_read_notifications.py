"""Add read_notifications table

Revision ID: 002_read_notifications
Revises: 001_initial
Create Date: 2024-12-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_read_notifications'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verifică dacă tabelul există deja
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    if 'read_notifications' not in tables:
        # Tabela read_notifications
        op.create_table(
            'read_notifications',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('notification_type', sa.String(), nullable=False),
            sa.Column('notification_id', sa.Integer(), nullable=False),
            sa.Column('activity_id', sa.Integer(), nullable=False),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['activity_id'], ['activities.id'], )
        )
        op.create_index(op.f('ix_read_notifications_id'), 'read_notifications', ['id'], unique=False)
        # Index compus pentru căutare rapidă
        op.create_index('ix_read_notifications_user_type_id', 'read_notifications', ['user_id', 'notification_type', 'notification_id'], unique=False)
    else:
        # Tabelul există deja, verifică dacă index-urile există
        indexes = [idx['name'] for idx in inspector.get_indexes('read_notifications')]
        if 'ix_read_notifications_id' not in indexes:
            op.create_index(op.f('ix_read_notifications_id'), 'read_notifications', ['id'], unique=False)
        if 'ix_read_notifications_user_type_id' not in indexes:
            op.create_index('ix_read_notifications_user_type_id', 'read_notifications', ['user_id', 'notification_type', 'notification_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_read_notifications_user_type_id', table_name='read_notifications')
    op.drop_index(op.f('ix_read_notifications_id'), table_name='read_notifications')
    op.drop_table('read_notifications')

