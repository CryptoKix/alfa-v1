#!/usr/bin/env python3
"""
Authentication API routes for TacTix.
"""
from flask import Blueprint, request, jsonify, make_response
from middleware.auth import (
    verify_auth_token,
    create_session_token,
    get_auth_status,
    SESSION_EXPIRY_HOURS
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate with the local auth token.

    Request body:
        {"token": "your-auth-token"}

    Response:
        200: {"success": true} with session cookie
        401: {"error": "Invalid token"}
    """
    data = request.get_json() or {}
    token = data.get('token', '')

    if not token:
        return jsonify({
            'success': False,
            'error': 'Token required'
        }), 400

    if not verify_auth_token(token):
        return jsonify({
            'success': False,
            'error': 'Invalid authentication token'
        }), 401

    # Create session token
    session_token = create_session_token({
        'source': 'local_auth'
    })

    # Create response with session cookie
    response = make_response(jsonify({
        'success': True,
        'message': 'Authenticated successfully',
        'expires_in_hours': SESSION_EXPIRY_HOURS
    }))

    # Set secure cookie
    response.set_cookie(
        'tactix_session',
        session_token,
        httponly=True,
        secure=False,  # Set to True if using HTTPS
        samesite='Strict',
        max_age=SESSION_EXPIRY_HOURS * 3600
    )

    return response


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Clear the session cookie.

    Response:
        200: {"success": true}
    """
    response = make_response(jsonify({
        'success': True,
        'message': 'Logged out successfully'
    }))

    # Clear session cookie
    response.delete_cookie('tactix_session')

    return response


@auth_bp.route('/status', methods=['GET'])
def status():
    """
    Get current authentication status.

    Response:
        200: {"enabled": bool, "authenticated": bool, "session_expiry_hours": int}
    """
    return jsonify(get_auth_status())
