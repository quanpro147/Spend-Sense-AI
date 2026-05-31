"""add_goals_and_preferences

Revision ID: a1b2c3d4e5f6
Revises: dd69ecde196e
Create Date: 2026-05-31 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'dd69ecde196e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'financial_goals' not in existing_tables:
        op.create_table(
            'financial_goals',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('emoji', sa.String(length=16), nullable=False),
            sa.Column('target_amount', sa.Float(), nullable=False),
            sa.Column('current_amount', sa.Float(), nullable=False),
            sa.Column('monthly_target', sa.Float(), nullable=False),
            sa.Column('deadline', sa.Date(), nullable=True),
            sa.Column('ai_note', sa.String(length=1000), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )

    if 'user_preferences' not in existing_tables:
        op.create_table(
            'user_preferences',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('weekly_report', sa.Boolean(), nullable=False),
            sa.Column('rebalance_suggestions', sa.Boolean(), nullable=False),
            sa.Column('anomaly_alerts', sa.Boolean(), nullable=False),
            sa.Column('goal_reminders', sa.Boolean(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id'),
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'user_preferences' in existing_tables:
        op.drop_table('user_preferences')
    if 'financial_goals' in existing_tables:
        op.drop_table('financial_goals')
